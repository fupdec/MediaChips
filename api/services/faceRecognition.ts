import type { ApiDb } from '../types/db'
import type { ModelStatus } from '../types/mlModels'
import type { FaceBox, FaceLandmark5 } from '../types/faceDetector'
import { Jimp } from 'jimp'
import { createFaceEnrollmentsRepository } from '../db/repositories/faceEnrollments'
import { createFacesRepository } from '../db/repositories/faces'
import { createMetaRepository } from '../db/repositories/meta'
import { createSettingsRepository } from '../db/repositories/settings'
import { createTagsRepository } from '../db/repositories/tags'
import { createTagsInMediaRepository } from '../db/repositories/tagsInMedia'
import { createMediaRepository } from '../db/repositories/media'
import {
  loadModel as loadDetectionModel,
} from './faceDetector'
import {
  alignFaceRgb112,
} from './faceAlign'
import { isMatchableStoredFace } from './matchGates'
import {clusterFacesInMedia} from './faceCluster'
import {
  embeddingFromJson,
  embeddingToJson,
  l2Normalize,
  parseEnrollmentRefs,
} from './faceMatchScoring'
import {
  filterPendingEnrollmentPaths,
  findTagImagePaths,
  resolveAbsoluteCropPath as resolveAbsoluteCropPathFromDb,
} from './faceEnrollmentPaths'
import {
  uniqueMediaTagApplies,
  type FaceMatchMode,
} from './faceMatchApply'
import {
  prepareMatchFacesForMedia,
  resolveClusterMatchesForMedia,
  resolveMatchMediaFacesGate,
} from './faceMediaMatchResolve'
import {
  buildClearedFaceMatchUpdate,
  resolveAssignMatchFields,
} from './faceAssignMatch'
import {
  enrollTagFromAllImages,
} from './faceEnrollTag'
import {resolveCachedModelStatus} from './faceModelStatus'
import {
  packInterleavedRgbToNchw,
  rgbaBitmapToInterleavedRgb,
} from './faceTensorPrep'
import {parseFaceMatchSettingsFromMap} from './faceSettingsParse'
import {
  applyFaceMatchMediaResult,
  buildFaceMatchCompleteEvent,
  buildFaceMatchProgressEvent,
  createFaceMatchIterateCounters,
  markFaceMatchIterateFailed,
} from './faceMatchIterate'
import {
  applyFaceEnrollTagOutcome,
  buildFaceEnrollCompleteEvent,
  buildFaceEnrollProgressEvent,
  classifyEnrollAttempt,
  createFaceEnrollIterateCounters,
  getEnrollTagSkipReason,
  resolveEnrollTagFacesPlan,
} from './faceEnrollIterate'
import {
  assembleListedFacesForMedia,
  buildListedPreparedFacesFromRows,
} from './faceListBuild'
import {
  ensureCachedModelFile,
  getFaceModelCacheDir,
  getOrt,
  resolveCachedModelPath,
  type OrtSession,
} from './faceOrtRuntime'

const EMBED_MODEL_ID = 'insightface-r50'
/** Bump when preprocess/ranking/model changes so stale enrollments are wiped. */
const EMBED_SPACE_ID = 'insightface-r50-scrfd-kps-v1'
const EMBED_MODEL_FILENAME = 'w600k_r50.onnx'
const EMBED_MODEL_URL = 'https://huggingface.co/deepghs/insightface/resolve/main/buffalo_l/w600k_r50.onnx'
const EMBED_MODEL_SETTING = 'faceMatch.embedModelId'
/** Rough download size shown in UI copy (~buffalo_l recognition head). */
const EMBED_MODEL_SIZE_MB = 170
const EMBED_SIZE = 112
const EMBED_INPUT_MEAN = 127.5
const EMBED_INPUT_STD = 127.5

export type {FaceMatchMode}

export interface FaceMatchSettings {
  performerMetaId: number | null
  minConfidence: number
  candidateLimit: number
  mode: FaceMatchMode
  matchAfterDetect: boolean
}

export interface FaceMatchProgressEvent {
  type: 'progress' | 'complete' | 'error' | 'status'
  phase?: 'downloading_embed' | 'downloading_align' | 'embed_ready'
  processed?: number
  total?: number
  remaining?: number
  matched?: number
  applied?: number
  enrolled?: number
  skipped?: number
  failed?: number
  current?: string
  mediaId?: number
  message?: string
  sizeMb?: number
  stopped?: boolean
}

let embedSession: OrtSession | null = null
let loadingPromise: Promise<OrtSession> | null = null
let lastError: Error | null = null

const getWritableModelCacheDir = (db: ApiDb) => getFaceModelCacheDir(db, EMBED_MODEL_ID)

const getModelPath = (db: ApiDb) =>
  resolveCachedModelPath(db, EMBED_MODEL_ID, EMBED_MODEL_FILENAME)

function hasDownloadedEmbedModel(db: ApiDb) {
  return Boolean(getModelPath(db))
}

function migrateEmbedModelIfNeeded(db: ApiDb) {
  const settingsRepo = createSettingsRepository(db.drizzle)
  const current = String(settingsRepo.findByOption(EMBED_MODEL_SETTING)?.value || '')
  if (current === EMBED_SPACE_ID) return

  // Old enrollments live in a different embedding space and must be rebuilt.
  createFaceEnrollmentsRepository(db.drizzle).deleteAll()
  createFacesRepository(db.drizzle).clearAllMatches()
  settingsRepo.upsertByOption(EMBED_MODEL_SETTING, EMBED_SPACE_ID)
  embedSession = null
  lastError = null
}

async function ensureEmbedModelFile(db: ApiDb): Promise<{path: string; downloaded: boolean}> {
  return ensureCachedModelFile(db, {
    modelId: EMBED_MODEL_ID,
    filename: EMBED_MODEL_FILENAME,
    url: EMBED_MODEL_URL,
    errorLabel: 'face embed model',
  })
}

async function loadEmbedModel(db: ApiDb): Promise<OrtSession> {
  if (embedSession) return embedSession
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    try {
      migrateEmbedModelIfNeeded(db)
      const {path: modelPath} = await ensureEmbedModelFile(db)
      const ort = getOrt()
      embedSession = await ort.InferenceSession.create(modelPath)
      lastError = null
      return embedSession
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error))
      throw lastError
    } finally {
      loadingPromise = null
    }
  })()

  return loadingPromise
}

type EmbedPrepEvent = {
  type: 'status'
  phase: 'downloading_embed' | 'downloading_align' | 'embed_ready'
  message: string
  sizeMb?: number
}

async function* prepareEmbedModel(db: ApiDb): AsyncGenerator<EmbedPrepEvent> {
  migrateEmbedModelIfNeeded(db)

  // Alignment uses SCRFD 5-point landmarks from detection (no separate 2d106 download).

  const needsDownload = !hasDownloadedEmbedModel(db)
  if (needsDownload) {
    yield {
      type: 'status',
      phase: 'downloading_embed',
      message: `Downloading face recognition model (~${EMBED_MODEL_SIZE_MB} MB)…`,
      sizeMb: EMBED_MODEL_SIZE_MB,
    }
  }
  await loadEmbedModel(db)
  if (needsDownload) {
    yield {
      type: 'status',
      phase: 'embed_ready',
      message: 'Face recognition model downloaded.',
      sizeMb: EMBED_MODEL_SIZE_MB,
    }
  }
}

function getEmbedStatus(db: ApiDb): ModelStatus {
  migrateEmbedModelIfNeeded(db)
  return resolveCachedModelStatus({
    modelId: EMBED_MODEL_ID,
    path: getWritableModelCacheDir(db),
    sessionLoaded: Boolean(embedSession),
    loading: Boolean(loadingPromise),
    lastError,
    downloaded: hasDownloadedEmbedModel(db),
  })
}

function resolvePerformerMetaId(db: ApiDb, configuredId?: number | null): number | null {
  if (configuredId && Number.isFinite(configuredId) && configuredId > 0) return configuredId
  const metaRepo = createMetaRepository(db.drizzle)
  const scraperMeta = metaRepo.findAll().find((meta) => Boolean(meta.scraper) && meta.type === 'array')
  return scraperMeta?.id != null ? Number(scraperMeta.id) : null
}

function getFaceMatchSettings(db: ApiDb): FaceMatchSettings {
  const options = [
    'faceMatch.performerMetaId',
    'faceMatch.minConfidence',
    'faceMatch.candidateLimit',
    'faceMatch.mode',
    'faceMatch.matchAfterDetect',
  ]
  const rows = createSettingsRepository(db.drizzle).findByOptions(options)
  const map = new Map(rows.map((row) => [String(row.option), row.value]))
  return parseFaceMatchSettingsFromMap(map, (configuredId) =>
    resolvePerformerMetaId(db, configuredId),
  )
}

function rgbToEmbedTensor(rgb: Uint8Array, width: number, height: number) {
  const ort = getOrt()
  const floatData = packInterleavedRgbToNchw(
    rgb,
    width,
    height,
    EMBED_INPUT_MEAN,
    EMBED_INPUT_STD,
  )
  return new ort.Tensor('float32', floatData, [1, 3, height, width])
}

async function imageToEmbedTensorLetterbox(imagePath: string) {
  const image = await Jimp.read(imagePath)
  // Letterbox fallback when landmarks are unavailable.
  const resized = image.clone().contain({w: EMBED_SIZE, h: EMBED_SIZE})
  const rgb = rgbaBitmapToInterleavedRgb(resized.bitmap.data, EMBED_SIZE * EMBED_SIZE)
  return rgbToEmbedTensor(rgb, EMBED_SIZE, EMBED_SIZE)
}

async function embedImage(
  db: ApiDb,
  imagePath: string,
  box?: FaceBox | null,
  kps?: FaceLandmark5 | null,
): Promise<Float32Array> {
  const model = await loadEmbedModel(db)
  let tensor
  if (box && Number(box.width) > 1 && Number(box.height) > 1) {
    try {
      const image = await Jimp.read(imagePath)
      const aligned = await alignFaceRgb112(db, image, box, kps)
      tensor = aligned
        ? rgbToEmbedTensor(aligned, EMBED_SIZE, EMBED_SIZE)
        : await imageToEmbedTensorLetterbox(imagePath)
    } catch {
      tensor = await imageToEmbedTensorLetterbox(imagePath)
    }
  } else {
    tensor = await imageToEmbedTensorLetterbox(imagePath)
  }
  const inputName = model.inputNames[0] || 'input'
  const outputs = await model.run({[inputName]: tensor})
  const embeddingTensor = outputs.embedding || outputs[model.outputNames[0]]
  if (!embeddingTensor) throw new Error('Face embed model returned no embedding.')
  return l2Normalize(embeddingTensor.data as Float32Array)
}

function resolveAbsoluteCropPath(db: ApiDb, cropPath: string | null | undefined) {
  return resolveAbsoluteCropPathFromDb(String(db.path || ''), cropPath)
}

/** Prefer stored embedding; fall back to legacy crop files. */
async function loadFaceEmbedding(
  db: ApiDb,
  face: {embedding?: string | null; cropPath?: string | null},
): Promise<Float32Array | null> {
  if (face.embedding) {
    try {
      return embeddingFromJson(String(face.embedding))
    } catch {
      // Fall through to crop.
    }
  }
  const cropPath = resolveAbsoluteCropPath(db, face.cropPath)
  if (!cropPath) return null
  try {
    return await embedImage(db, cropPath)
  } catch {
    return null
  }
}

async function* iterateEnrollFromPerformerImages(
  db: ApiDb,
  {
    shouldStop = () => false,
    force = false,
    metaId: metaIdOverride,
  }: {
    shouldStop?: () => boolean
    force?: boolean
    metaId?: number | null
  } = {},
): AsyncGenerator<FaceMatchProgressEvent> {
  const settings = getFaceMatchSettings(db)
  const metaId = resolvePerformerMetaId(db, metaIdOverride ?? settings.performerMetaId)
  if (!metaId) {
    yield {type: 'error', message: 'Performer category is not configured.'}
    return
  }

  await loadDetectionModel(db)
  yield* prepareEmbedModel(db)

  const tags = createTagsRepository(db.drizzle, db.sqlite).findByMetaIds([metaId])
  const enrollmentsRepo = createFaceEnrollmentsRepository(db.drizzle)
  const total = tags.length
  let counters = createFaceEnrollIterateCounters()

  yield buildFaceEnrollProgressEvent(counters, total)

  for (const tag of tags) {
    if (shouldStop()) {
      yield buildFaceEnrollCompleteEvent(counters, total, true)
      return
    }

    const tagId = Number(tag.id)
    const existing = enrollmentsRepo.findByTagId(tagId)
    const imagePaths = findTagImagePaths(String(db.path), metaId, tagId)
    const existingSources = new Set(
      existing.map((row) => String(row.sourcePath || '')).filter(Boolean),
    )
    const pendingPaths = filterPendingEnrollmentPaths({
      imagePaths,
      existingSourcePaths: existingSources,
      dbPath: String(db.path || ''),
      force,
    })

    const skipReason = getEnrollTagSkipReason({
      imageCount: imagePaths.length,
      pendingCount: pendingPaths.length,
    })

    if (skipReason) {
      counters = applyFaceEnrollTagOutcome(counters, skipReason)
      yield buildFaceEnrollProgressEvent(counters, total, {
        current: tag.name || String(tagId),
      })
      continue
    }

    let outcome: ReturnType<typeof classifyEnrollAttempt>
    try {
      const created = await enrollTagFromAllImages(db, tagId, metaId, imagePaths, {force})
      outcome = classifyEnrollAttempt({created})
    } catch {
      outcome = 'failed'
    }

    counters = applyFaceEnrollTagOutcome(counters, outcome)
    yield buildFaceEnrollProgressEvent(counters, total, {
      current: tag.name || String(tagId),
    })
  }

  yield buildFaceEnrollCompleteEvent(counters, total, false)
}

async function matchMediaFaces(
  db: ApiDb,
  mediaId: number,
  options: {force?: boolean; settings?: FaceMatchSettings} = {},
) {
  const settings = options.settings || getFaceMatchSettings(db)
  const metaId = settings.performerMetaId
  const facesRepo = createFacesRepository(db.drizzle)
  const faces = metaId ? facesRepo.findByMediaId(mediaId) : []
  const enrollments = metaId && faces.length
    ? parseEnrollmentRefs(
      createFaceEnrollmentsRepository(db.drizzle).findByMetaId(metaId),
    )
    : []

  const gate = resolveMatchMediaFacesGate({
    metaId,
    facesCount: faces.length,
    enrollmentsCount: enrollments.length,
  })
  if (!gate.ok) return gate.result

  await loadEmbedModel(db)

  const {prepared, skipped} = await prepareMatchFacesForMedia({
    faces,
    force: options.force,
    enrollments,
    candidateLimit: settings.candidateLimit,
    loadEmbedding: (face) => loadFaceEmbedding(db, face),
    isMatchable: isMatchableStoredFace,
  })

  let applied = 0
  const clustered = clusterFacesInMedia(prepared)
  const {updates, tagsToApply, matched} = resolveClusterMatchesForMedia({
    clustered,
    enrollments,
    candidateLimit: settings.candidateLimit,
    minConfidence: settings.minConfidence,
    mode: settings.mode,
    mediaId,
    metaId: Number(metaId),
  })

  for (const {faceId, update} of updates) {
    facesRepo.updateMatch(faceId, update)
  }

  if (tagsToApply.length) {
    const unique = uniqueMediaTagApplies(tagsToApply)
    createTagsInMediaRepository(db.drizzle).bulkCreate(unique)
    applied = unique.length
  }

  return {matched, applied, skipped, faces: faces.length}
}

async function assignFaceToPerformer(
  db: ApiDb,
  faceId: number,
  tagId: number,
  options: {enroll?: boolean; applyTag?: boolean; matchScore?: number | null} = {},
) {
  const facesRepo = createFacesRepository(db.drizzle)
  const face = facesRepo.findById(faceId)
  if (!face) throw new Error('Face not found')

  const tag = createTagsRepository(db.drizzle, db.sqlite).findById(tagId)
  if (!tag?.metaId) throw new Error('Performer tag not found')

  const metaId = Number(tag.metaId)
  // Opt-in: picking a face only binds suggestion unless applyTag is explicitly true.
  const applyTag = options.applyTag === true
  const enroll = options.enroll === true
  const fields = resolveAssignMatchFields({
    applyTag,
    matchScore: options.matchScore,
    existingMatchScore: face.matchScore,
  })
  facesRepo.updateMatch(faceId, {
    tagId,
    ...fields,
  })

  if (applyTag) {
    createTagsInMediaRepository(db.drizzle).bulkCreate([{
      mediaId: Number(face.mediaId),
      tagId,
      metaId,
    }])
  }

  if (enroll) {
    try {
      let embeddingJson: string | null = face.embedding ? String(face.embedding) : null
      if (!embeddingJson) {
        const cropPath = resolveAbsoluteCropPath(db, face.cropPath)
        if (cropPath) {
          const embedding = await embedImage(db, cropPath)
          embeddingJson = embeddingToJson(embedding)
        }
      }
      if (embeddingJson) {
        createFaceEnrollmentsRepository(db.drizzle).create({
          tagId,
          metaId,
          source: 'faceCrop',
          sourcePath: face.cropPath || `face:${faceId}`,
          embedding: embeddingJson,
        })
      }
    } catch (err) {
      console.warn('[faceRecognition] enroll after assign failed:', err)
    }
  }

  return {faceId, tagId, metaId, mediaId: Number(face.mediaId)}
}

function clearFaceMatch(db: ApiDb, faceId: number) {
  const facesRepo = createFacesRepository(db.drizzle)
  const face = facesRepo.findById(faceId)
  if (!face) throw new Error('Face not found')

  facesRepo.updateMatch(faceId, buildClearedFaceMatchUpdate())

  return {
    faceId,
    mediaId: Number(face.mediaId),
    tagId: null,
    matchStatus: 'unmatched',
  }
}

async function listFacesForMedia(db: ApiDb, mediaId: number, options: {
  candidates?: boolean
  ensureCrops?: boolean
} = {}) {
  const facesRepo = createFacesRepository(db.drizzle)
  const tagsRepo = createTagsRepository(db.drizzle, db.sqlite)
  const settings = getFaceMatchSettings(db)

  // Review UI needs crops for this video only; rebuild if auto-scan skipped them.
  // Callers can skip this for a fast first paint, then request crops in a follow-up.
  if (options.ensureCrops !== false) {
    try {
      const {ensureFaceCropsForMedia} = require('./faceDetector') as typeof import('./faceDetector')
      await ensureFaceCropsForMedia(db, mediaId)
    } catch {
      // Listing should still work without preview crops.
    }
  }

  // Re-read after crop paths may have been written.
  const faceRows = facesRepo.findByMediaId(mediaId)
  const enrollmentRefs = settings.performerMetaId && options.candidates !== false
    ? parseEnrollmentRefs(
      createFaceEnrollmentsRepository(db.drizzle).findByMetaId(settings.performerMetaId),
    )
    : []

  // Prefer stored vectors for listing — never warm the ONNX embed model here.
  const tagsById = new Map(
    (settings.performerMetaId
      ? tagsRepo.findByMetaIds([settings.performerMetaId])
      : []
    ).map((tag) => [Number(tag.id), tag]),
  )
  const resolveTag = (tagId: number) => {
    const cached = tagsById.get(tagId)
    if (cached) return cached
    const tag = tagsRepo.findById(tagId)
    if (tag) tagsById.set(tagId, tag)
    return tag
  }

  const prepared = buildListedPreparedFacesFromRows({
    faceRows,
    enrollmentRefs,
    candidateLimit: settings.candidateLimit,
    resolveTag,
  })

  return assembleListedFacesForMedia({
    mediaId,
    prepared,
    enrollmentRefs,
    candidateLimit: settings.candidateLimit,
    resolveTag,
  })
}

async function* iterateFaceMatching(
  db: ApiDb,
  {
    shouldStop = () => false,
    force = false,
    mediaIds,
  }: {
    shouldStop?: () => boolean
    force?: boolean
    mediaIds?: number[]
  } = {},
): AsyncGenerator<FaceMatchProgressEvent> {
  const settings = getFaceMatchSettings(db)
  if (!settings.performerMetaId) {
    yield {type: 'error', message: 'Performer category is not configured.'}
    return
  }

  const enrollmentsCount = createFaceEnrollmentsRepository(db.drizzle)
    .countByMetaId(settings.performerMetaId)
  if (!enrollmentsCount) {
    yield {type: 'error', message: 'No enrolled performer faces. Enroll from performer images first.'}
    return
  }

  yield* prepareEmbedModel(db)

  const facesRepo = createFacesRepository(db.drizzle)
  const mediaRepo = createMediaRepository(db.drizzle)
  let ids = mediaIds?.length
    ? mediaIds
    : facesRepo.findDistinctMediaIds()

  // Keep only existing media
  ids = ids.filter((id) => Boolean(mediaRepo.findById(Number(id))))

  const total = ids.length
  let counters = createFaceMatchIterateCounters()

  yield buildFaceMatchProgressEvent(counters, total)

  for (const mediaId of ids) {
    if (shouldStop()) {
      yield buildFaceMatchCompleteEvent(counters, total, true)
      return
    }

    try {
      const result = await matchMediaFaces(db, Number(mediaId), {force, settings})
      counters = applyFaceMatchMediaResult(counters, result)
    } catch {
      counters = markFaceMatchIterateFailed(counters)
    }

    const media = mediaRepo.findById(Number(mediaId))
    yield buildFaceMatchProgressEvent(counters, total, {
      current: media?.path || String(mediaId),
      mediaId: Number(mediaId),
    })
  }

  yield buildFaceMatchCompleteEvent(counters, total, false)
}

async function enrollTagFaces(
  db: ApiDb,
  tagId: number,
  options: {force?: boolean} = {},
): Promise<{
  tagId: number
  metaId: number
  created: number
  skipped: boolean
  reason?: string
}> {
  const tagsRepo = createTagsRepository(db.drizzle, db.sqlite)
  const tag = tagsRepo.findById(tagId)
  const settings = getFaceMatchSettings(db)
  const imagePaths = tag?.metaId
    ? findTagImagePaths(String(db.path), Number(tag.metaId), tagId)
    : []
  const plan = resolveEnrollTagFacesPlan({
    tagFound: Boolean(tag?.metaId),
    metaId: tag?.metaId != null ? Number(tag.metaId) : null,
    performerMetaId: settings.performerMetaId,
    imagePaths,
    force: options.force,
  })

  if (plan.kind === 'skip') {
    return {tagId, metaId: plan.metaId, created: 0, skipped: true, reason: plan.reason}
  }

  if (plan.kind === 'clear-empty') {
    // Photo removed — clear stale references for this tag.
    if (plan.clearEnrollments) {
      createFaceEnrollmentsRepository(db.drizzle).deleteByTagId(tagId)
    }
    return {tagId, metaId: plan.metaId, created: 0, skipped: false}
  }

  await loadDetectionModel(db)
  await loadEmbedModel(db)
  const created = await enrollTagFromAllImages(db, tagId, plan.metaId, plan.imagePaths, {
    force: options.force !== false,
  })
  return {tagId, metaId: plan.metaId, created, skipped: false}
}

function getFaceMatchStatus(db: ApiDb) {
  const settings = getFaceMatchSettings(db)
  const facesRepo = createFacesRepository(db.drizzle)
  const enrollmentsRepo = createFaceEnrollmentsRepository(db.drizzle)
  const metaId = settings.performerMetaId
  const performerTags = metaId
    ? createTagsRepository(db.drizzle, db.sqlite).findByMetaIds([metaId]).length
    : 0

  return {
    settings,
    embedModel: getEmbedStatus(db),
    faces: facesRepo.countAll(),
    matchedFaces: facesRepo.countMatched(),
    performerTags,
    enrolledFaces: metaId ? enrollmentsRepo.countByMetaId(metaId) : 0,
    enrolledTags: metaId ? enrollmentsRepo.countDistinctTagsByMetaId(metaId) : 0,
  }
}

export {
  EMBED_MODEL_ID,
  EMBED_MODEL_SIZE_MB,
  assignFaceToPerformer,
  clearFaceMatch,
  embedImage,
  embeddingToJson,
  enrollTagFaces,
  getEmbedStatus,
  getFaceMatchSettings,
  getFaceMatchStatus,
  hasDownloadedEmbedModel,
  iterateEnrollFromPerformerImages,
  iterateFaceMatching,
  listFacesForMedia,
  loadEmbedModel,
  matchMediaFaces,
  prepareEmbedModel,
  resolvePerformerMetaId,
}
