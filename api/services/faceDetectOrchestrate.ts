/** Batch face detect + optional match-after-detect (breaks faceDetector↔faceRecognition cycle). */

import type {ApiDb} from '../types/db'
import type {
  FaceDetectionProgressEvent,
  FaceDetectorOptions,
} from '../types/faceDetector'
import {createMediaRepository} from '../db/repositories/media'
import {createMediaTypesRepository} from '../db/repositories/mediaTypes'
import {resolveExistingPath} from './contentHash'
import {
  prepareGenderModel,
} from './faceGender'
import {
  applyFaceDetectMediaResult,
  buildFaceDetectCompleteEvent,
  buildFaceDetectErrorEvent,
  buildFaceDetectProgressEvent,
  createFaceDetectIterateCounters,
  resolveFaceDetectIterateItems,
  resolveMatchSettingsAfterDetect,
} from './faceDetectIterate'
import {
  detectMedia,
  getFaceDetectSettings,
  prepareDetectModel,
  purgeAllFaceCrops,
} from './faceDetector'
import {prepareEmbedModel} from './faceEmbedRuntime'
import {shouldPrepareGenderFilter} from './faceDetectPersist'
import {
  getFaceMatchSettings,
  loadFaceMatchBatchContext,
  matchMediaFaces,
  type FaceMatchBatchContext,
  type FaceMatchSettings,
} from './faceRecognition'
import {applyBlindPersonTagsForMedia} from './faceBlindAutoTag'

async function getVideoMediaTypeId(db: ApiDb) {
  const mediaTypesRepo = createMediaTypesRepository(db.drizzle)
  const videoType = mediaTypesRepo.findByType('video')
  return videoType?.id || null
}

function withBlindOverride(
  settings: FaceMatchSettings,
  autoBlindTags?: boolean,
): FaceMatchSettings {
  if (autoBlindTags !== true) return settings
  return {...settings, autoBlindTags: true}
}

function resolveMatchContextAfterDetect(
  db: ApiDb,
  applyTags?: boolean,
  autoBlindTags?: boolean,
): FaceMatchBatchContext | null {
  const settings = resolveMatchSettingsAfterDetect({
    matchSettings: getFaceMatchSettings(db),
    applyTags,
  })
  if (!settings) return null
  return loadFaceMatchBatchContext(db, withBlindOverride(settings, autoBlindTags))
}

async function maybeMatchAfterDetect(
  db: ApiDb,
  mediaId: number | string | null | undefined,
  options: {force?: boolean; context?: FaceMatchBatchContext | null},
): Promise<number> {
  const id = mediaId == null ? NaN : Number(mediaId)
  if (!Number.isFinite(id) || id <= 0 || !options.context) return 0
  try {
    const result = await matchMediaFaces(db, id, {
      force: Boolean(options.force),
      context: options.context,
    })
    return Number(result?.blindTagsCreated) || 0
  } catch {
    // Matching is optional and should not fail detection.
    return 0
  }
}

async function maybeBlindAutoTagAfterDetect(
  db: ApiDb,
  mediaId: number | string | null | undefined,
  settings: FaceMatchSettings,
): Promise<number> {
  const id = mediaId == null ? NaN : Number(mediaId)
  const metaId = settings.performerMetaId
  if (!settings.autoBlindTags || !metaId || !Number.isFinite(id) || id <= 0) return 0
  try {
    const result = applyBlindPersonTagsForMedia(db, id, {metaId: Number(metaId)})
    return Number(result.createdTags) || 0
  } catch {
    // Blind tagging is optional and should not fail detection.
    return 0
  }
}

export async function* iterateFaceDetection(
  db: ApiDb,
  {
    shouldStop = () => false,
    force = false,
    mediaIds,
    paths,
    framesPerVideo,
    minScore,
    persistCrops = false,
    applyTags,
    autoBlindTags,
  }: FaceDetectorOptions & {
    shouldStop?: () => boolean
    mediaIds?: Array<number | string>
    paths?: string[]
  } = {},
): AsyncGenerator<FaceDetectionProgressEvent> {
  const mediaRepo = createMediaRepository(db.drizzle)
  const videoTypeId = await getVideoMediaTypeId(db)
  const detectSettings = getFaceDetectSettings(db)
  const resolvedFramesPerVideo = Number(framesPerVideo ?? detectSettings.framesPerVideo)
  const resolvedMinScore = Number(minScore ?? detectSettings.minScore)

  const items = resolveFaceDetectIterateItems({
    mediaIds,
    paths,
    videoTypeId,
    findById: (id) => mediaRepo.findById(id),
    findByPaths: (pathList, typeId) => mediaRepo.findByPaths(pathList, typeId),
    findByMediaType: (typeId) => mediaRepo.findByMediaType(typeId),
  })

  // Auto-scan never keeps crop galleries — free disk from older runs.
  if (!persistCrops) {
    purgeAllFaceCrops(db)
  }

  try {
    yield* prepareDetectModel(db)
  } catch (error: unknown) {
    yield buildFaceDetectErrorEvent(error, 'Face detection model is unavailable.')
    return
  }

  if (shouldPrepareGenderFilter(detectSettings.genderFilter)) {
    try {
      yield* prepareGenderModel(db)
    } catch (error: unknown) {
      yield buildFaceDetectErrorEvent(error, 'Face gender model is unavailable.')
      return
    }
  }

  try {
    yield* prepareEmbedModel(db)
  } catch {
    // Embedding is optional during detect; matching will skip faces without vectors.
  }

  const total = items.length
  let counters = createFaceDetectIterateCounters()
  const matchContext = resolveMatchContextAfterDetect(db, applyTags, autoBlindTags)
  const blindOnlySettings = withBlindOverride(getFaceMatchSettings(db), autoBlindTags)

  yield buildFaceDetectProgressEvent(counters, total)

  for (const item of items) {
    if (shouldStop()) {
      yield buildFaceDetectCompleteEvent(counters, total, true)
      return
    }

    const resolvedPath = item.path ? await resolveExistingPath(String(item.path)) : null
    const result = await detectMedia(db, {
      id: item.id,
      path: resolvedPath || item.path,
    }, {
      force,
      framesPerVideo: resolvedFramesPerVideo,
      minScore: resolvedMinScore,
      persist: true,
      persistCrops: Boolean(persistCrops),
      applyTags,
    })

    let blindTagsCreated = 0
    if (!result.failed && !result.missing && !result.skipped) {
      if (matchContext) {
        blindTagsCreated = await maybeMatchAfterDetect(db, result.mediaId, {force, context: matchContext})
      } else {
        blindTagsCreated = await maybeBlindAutoTagAfterDetect(db, result.mediaId, blindOnlySettings)
      }
    }

    counters = applyFaceDetectMediaResult(counters, {
      missing: result.missing,
      failed: result.failed,
      skipped: result.skipped,
      facesLength: result.faces.length,
      blindTagsCreated,
    })

    yield buildFaceDetectProgressEvent(counters, total, {
      current: result.mediaPath || undefined,
      mediaId: result.mediaId,
    })
  }

  yield buildFaceDetectCompleteEvent(counters, total, false)
}
