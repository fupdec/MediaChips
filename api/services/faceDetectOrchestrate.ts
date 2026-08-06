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
import {getFaceMatchSettings, matchMediaFaces} from './faceRecognition'

async function getVideoMediaTypeId(db: ApiDb) {
  const mediaTypesRepo = createMediaTypesRepository(db.drizzle)
  const videoType = mediaTypesRepo.findByType('video')
  return videoType?.id || null
}

async function maybeMatchAfterDetect(
  db: ApiDb,
  mediaId: number | string | null | undefined,
  options: {force?: boolean; applyTags?: boolean},
) {
  const id = mediaId == null ? NaN : Number(mediaId)
  if (!Number.isFinite(id) || id <= 0) return
  try {
    const settings = resolveMatchSettingsAfterDetect({
      matchSettings: getFaceMatchSettings(db),
      applyTags: options.applyTags,
    })
    if (!settings) return
    await matchMediaFaces(db, id, {force: Boolean(options.force), settings})
  } catch {
    // Matching is optional and should not fail detection.
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

    if (!result.failed && !result.missing && !result.skipped) {
      await maybeMatchAfterDetect(db, result.mediaId, {force, applyTags})
    }

    counters = applyFaceDetectMediaResult(counters, {
      missing: result.missing,
      failed: result.failed,
      skipped: result.skipped,
      facesLength: result.faces.length,
    })

    yield buildFaceDetectProgressEvent(counters, total, {
      current: result.mediaPath || undefined,
      mediaId: result.mediaId,
    })
  }

  yield buildFaceDetectCompleteEvent(counters, total, false)
}
