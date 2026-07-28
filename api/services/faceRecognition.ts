import type { ApiDb } from '../types/db'
import type { ModelStatus } from '../types/mlModels'
import type { FaceBox, FaceLandmark5 } from '../types/faceDetector'
import fs from 'fs'
import https from 'https'
import http from 'http'
import os from 'os'
import path from 'path'
import { Jimp } from 'jimp'
import { createFaceEnrollmentsRepository } from '../db/repositories/faceEnrollments'
import { createFacesRepository } from '../db/repositories/faces'
import { createMetaRepository } from '../db/repositories/meta'
import { createSettingsRepository } from '../db/repositories/settings'
import { createTagsRepository } from '../db/repositories/tags'
import { createTagsInMediaRepository } from '../db/repositories/tagsInMedia'
import { createMediaRepository } from '../db/repositories/media'
import {
  detectFacesInFrame,
  loadModel as loadDetectionModel,
  saveFaceCrop,
} from './faceDetector'
import {
  alignFaceRgb112,
} from './faceAlign'
import {
  MAX_ENROLLMENTS_PER_TAG,
  assessEnrollmentDetections,
  isNearDuplicateEmbedding,
} from './enrollmentGates'
import { isMatchableStoredFace } from './matchGates'

const EMBED_MODEL_ID = 'insightface-r50'
/** Bump when preprocess/ranking/model changes so stale enrollments are wiped. */
const EMBED_SPACE_ID = 'insightface-r50-scrfd-kps-v1'
const EMBED_MODEL_FILENAME = 'w600k_r50.onnx'
const EMBED_MODEL_URL = 'https://huggingface.co/deepghs/insightface/resolve/main/buffalo_l/w600k_r50.onnx'
const EMBED_MODEL_SETTING = 'faceMatch.embedModelId'
/** Rough download size shown in UI copy (~buffalo_l recognition head). */
const EMBED_MODEL_SIZE_MB = 170
const EMBED_SIZE = 112
const EMBED_DIM = 512
const EMBED_INPUT_MEAN = 127.5
const EMBED_INPUT_STD = 127.5
/** Default / fallback how many gallery hits to expose in Face results. */
const DEFAULT_CANDIDATE_LIMIT = 10
const MIN_CANDIDATE_LIMIT = 3
const MAX_CANDIDATE_LIMIT = 20

export type FaceMatchMode = 'suggest' | 'auto'

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
  message?: string
  sizeMb?: number
  stopped?: boolean
}

type OrtModule = typeof import('onnxruntime-node')
type OrtSession = import('onnxruntime-node').InferenceSession

let ortModule: OrtModule | null = null
let embedSession: OrtSession | null = null
let loadingPromise: Promise<OrtSession> | null = null
let lastError: Error | null = null

function getOrt(): OrtModule {
  if (!ortModule) ortModule = require('onnxruntime-node') as OrtModule
  return ortModule
}

function getWritableModelCacheDir(db: ApiDb) {
  const base = db?.path_databases || process.app_folder || path.join(__dirname, '../../app_storage')
  return path.join(base, 'models', EMBED_MODEL_ID)
}

function getModelPath(db: ApiDb) {
  // R50 is not bundled with the app — only the user-data cache counts.
  const cached = path.join(getWritableModelCacheDir(db), EMBED_MODEL_FILENAME)
  return fs.existsSync(cached) ? cached : null
}

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

function downloadFile(url: string, destination: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const request = client.get(url, {
      headers: {
        'User-Agent': 'mediachips/1.0 (+https://github.com/fupdec/MediaChips)',
      },
    }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        downloadFile(response.headers.location, destination).then(resolve, reject)
        return
      }
      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`Failed to download face embed model (HTTP ${response.statusCode})`))
        return
      }
      const tmpPath = `${destination}.download`
      const file = fs.createWriteStream(tmpPath)
      response.pipe(file)
      file.on('finish', () => {
        file.close(() => {
          try {
            fs.renameSync(tmpPath, destination)
            resolve()
          } catch (error) {
            reject(error)
          }
        })
      })
      file.on('error', (error) => {
        try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
        reject(error)
      })
    })
    request.on('error', reject)
  })
}

async function ensureEmbedModelFile(db: ApiDb): Promise<{path: string; downloaded: boolean}> {
  const existing = getModelPath(db)
  if (existing) return {path: existing, downloaded: false}
  const cacheDir = getWritableModelCacheDir(db)
  fs.mkdirSync(cacheDir, {recursive: true})
  const destination = path.join(cacheDir, EMBED_MODEL_FILENAME)
  await downloadFile(EMBED_MODEL_URL, destination)
  return {path: destination, downloaded: true}
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
  if (embedSession) return {status: 'loaded', model: EMBED_MODEL_ID, path: getWritableModelCacheDir(db)}
  if (loadingPromise) return {status: 'loading', model: EMBED_MODEL_ID, path: getWritableModelCacheDir(db)}
  if (lastError) {
    return {
      status: 'error',
      model: EMBED_MODEL_ID,
      path: getWritableModelCacheDir(db),
      message: lastError.message,
    }
  }
  return {
    status: hasDownloadedEmbedModel(db) ? 'downloaded' : 'not_downloaded',
    model: EMBED_MODEL_ID,
    path: getWritableModelCacheDir(db),
  }
}

function parseBooleanSetting(value: unknown, fallback = false) {
  if (value == null || value === '') return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  const normalized = String(value).toLowerCase()
  return normalized === 'true' || normalized === '1'
}

function resolvePerformerMetaId(db: ApiDb, configuredId?: number | null): number | null {
  if (configuredId && Number.isFinite(configuredId) && configuredId > 0) return configuredId
  const metaRepo = createMetaRepository(db.drizzle)
  const scraperMeta = metaRepo.findAll().find((meta) => Boolean(meta.scraper) && meta.type === 'array')
  return scraperMeta?.id != null ? Number(scraperMeta.id) : null
}

function clampCandidateLimit(value: unknown): number {
  const raw = Number(value)
  if (!Number.isFinite(raw)) return DEFAULT_CANDIDATE_LIMIT
  return Math.min(MAX_CANDIDATE_LIMIT, Math.max(MIN_CANDIDATE_LIMIT, Math.round(raw)))
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

  const configuredMeta = Number(map.get('faceMatch.performerMetaId') || 0)
  const minConfidence = Number(map.get('faceMatch.minConfidence') ?? 0.55)
  const modeRaw = String(map.get('faceMatch.mode') || 'auto')
  const mode: FaceMatchMode = modeRaw === 'suggest' ? 'suggest' : 'auto'

  return {
    performerMetaId: resolvePerformerMetaId(db, configuredMeta || null),
    minConfidence: Number.isFinite(minConfidence) ? Math.min(Math.max(minConfidence, 0.2), 0.95) : 0.55,
    candidateLimit: clampCandidateLimit(map.get('faceMatch.candidateLimit') ?? DEFAULT_CANDIDATE_LIMIT),
    mode,
    matchAfterDetect: parseBooleanSetting(map.get('faceMatch.matchAfterDetect'), true),
  }
}

function l2Normalize(values: Float32Array | number[]) {
  let sum = 0
  for (let i = 0; i < values.length; i++) sum += values[i] * values[i]
  const norm = Math.sqrt(sum) || 1
  const out = new Float32Array(values.length)
  for (let i = 0; i < values.length; i++) out[i] = values[i] / norm
  return out
}

function cosineSimilarity(a: Float32Array, b: Float32Array) {
  const len = Math.min(a.length, b.length)
  let sum = 0
  for (let i = 0; i < len; i++) sum += a[i] * b[i]
  return sum
}

function embeddingToJson(embedding: Float32Array) {
  return JSON.stringify(Array.from(embedding))
}

function embeddingFromJson(value: string): Float32Array {
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return new Float32Array(EMBED_DIM)
    return l2Normalize(parsed.map(Number))
  } catch {
    return new Float32Array(EMBED_DIM)
  }
}

function rgbToEmbedTensor(rgb: Uint8Array, width: number, height: number) {
  const ort = getOrt()
  const floatData = new Float32Array(1 * 3 * width * height)
  const plane = width * height
  for (let i = 0; i < plane; i++) {
    floatData[i] = (rgb[i * 3] - EMBED_INPUT_MEAN) / EMBED_INPUT_STD
    floatData[plane + i] = (rgb[i * 3 + 1] - EMBED_INPUT_MEAN) / EMBED_INPUT_STD
    floatData[2 * plane + i] = (rgb[i * 3 + 2] - EMBED_INPUT_MEAN) / EMBED_INPUT_STD
  }
  return new ort.Tensor('float32', floatData, [1, 3, height, width])
}

async function imageToEmbedTensorLetterbox(imagePath: string) {
  const image = await Jimp.read(imagePath)
  // Letterbox fallback when landmarks are unavailable.
  const resized = image.clone().contain({w: EMBED_SIZE, h: EMBED_SIZE})
  const {data} = resized.bitmap
  const rgb = new Uint8Array(EMBED_SIZE * EMBED_SIZE * 3)
  for (let i = 0; i < EMBED_SIZE * EMBED_SIZE; i++) {
    rgb[i * 3] = data[i * 4]
    rgb[i * 3 + 1] = data[i * 4 + 1]
    rgb[i * 3 + 2] = data[i * 4 + 2]
  }
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

function averageEmbeddings(embeddings: Array<Float32Array | null | undefined>): Float32Array | null {
  const usable = embeddings.filter((item): item is Float32Array => Boolean(item && item.length))
  if (!usable.length) return null
  if (usable.length === 1) return usable[0]
  const dim = usable[0].length
  const sum = new Float32Array(dim)
  for (const embedding of usable) {
    const len = Math.min(dim, embedding.length)
    for (let i = 0; i < len; i++) sum[i] += embedding[i]
  }
  const scale = 1 / usable.length
  for (let i = 0; i < dim; i++) sum[i] *= scale
  return l2Normalize(sum)
}

function resolveAbsoluteCropPath(db: ApiDb, cropPath: string | null | undefined) {
  if (!cropPath) return null
  if (path.isAbsolute(cropPath)) return fs.existsSync(cropPath) ? cropPath : null
  const absolute = path.join(String(db.path), cropPath)
  return fs.existsSync(absolute) ? absolute : null
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

function findTagImagePaths(dbPath: string, metaId: number, tagId: number): string[] {
  const base = path.join(dbPath, 'meta', String(metaId))
  if (!fs.existsSync(base)) return []

  const preferredOrder = ['main', 'avatar', 'alt', 'custom1', 'custom2', 'header']
  const prefix = `${tagId}_`
  const found = new Map<string, string>()

  for (const name of fs.readdirSync(base)) {
    if (!name.startsWith(prefix) || !/\.jpe?g$/i.test(name)) continue
    const absolute = path.join(base, name)
    if (!fs.statSync(absolute).isFile()) continue
    const suffix = name.slice(prefix.length).replace(/\.jpe?g$/i, '').toLowerCase()
    found.set(suffix, absolute)
  }

  const ordered: string[] = []
  for (const key of preferredOrder) {
    const item = found.get(key)
    if (item) {
      ordered.push(item)
      found.delete(key)
    }
  }
  // Any other tag images (future suffixes) still help enrollment diversity.
  for (const item of found.values()) ordered.push(item)
  return ordered
}

function toEnrollmentSourcePath(db: ApiDb, imagePath: string) {
  const dbPath = String(db.path || '')
  if (dbPath && imagePath.startsWith(dbPath)) {
    return path.relative(dbPath, imagePath)
  }
  return imagePath
}

async function extractLargestFaceCrop(
  db: ApiDb,
  imagePath: string,
  outputPath: string,
  options: {fallbackWholeImage?: boolean; minScore?: number} = {},
): Promise<boolean> {
  const detector = await loadDetectionModel(db)
  const detections = await detectFacesInFrame(detector, imagePath, {
    minScore: options.minScore ?? 0.45,
    maxFacesPerFrame: 5,
  })
  if (!detections.length) {
    if (options.fallbackWholeImage === false) return false
    // Last resort only: letterbox the whole image (still weak — prefer real face crops).
    const image = await Jimp.read(imagePath)
    const buffer = await image.clone().contain({w: EMBED_SIZE, h: EMBED_SIZE}).getBuffer('image/jpeg', {quality: 90})
    await fs.promises.writeFile(outputPath, buffer)
    return true
  }

  const best = detections.reduce((a, b) => (
    (a.box.width * a.box.height) >= (b.box.width * b.box.height) ? a : b
  ))
  const sourceImage = await Jimp.read(imagePath)
  await saveFaceCrop(sourceImage, best.box as FaceBox, outputPath)
  return true
}

async function enrollTagImage(
  db: ApiDb,
  tagId: number,
  metaId: number,
  imagePath: string,
  source: 'tagImage' | 'faceCrop' | 'upload' = 'tagImage',
  options: {
    existingEmbeddings?: Float32Array[]
  } = {},
) {
  const detector = await loadDetectionModel(db)
  const detections = await detectFacesInFrame(detector, imagePath, {
    minScore: 0.5,
    maxFacesPerFrame: 5,
  })
  const image = await Jimp.read(imagePath)
  const assessment = assessEnrollmentDetections(detections, image.width, image.height)
  // Skip weak / group / tiny / no-face refs — they pollute ranking more than they help.
  if (!assessment.ok) return false

  const box = assessment.best.box as FaceBox
  const embedding = await embedImage(db, imagePath, box, assessment.best.kps || null)
  if (options.existingEmbeddings && isNearDuplicateEmbedding(embedding, options.existingEmbeddings)) {
    return false
  }
  createFaceEnrollmentsRepository(db.drizzle).create({
    tagId,
    metaId,
    source,
    sourcePath: toEnrollmentSourcePath(db, imagePath),
    embedding: embeddingToJson(embedding),
  })
  options.existingEmbeddings?.push(embedding)
  return true
}

async function enrollTagFromAllImages(
  db: ApiDb,
  tagId: number,
  metaId: number,
  imagePaths: string[],
  options: {force?: boolean} = {},
) {
  const enrollmentsRepo = createFaceEnrollmentsRepository(db.drizzle)
  const existing = enrollmentsRepo.findByTagId(tagId)
  if (options.force && existing.length) {
    enrollmentsRepo.deleteByTagId(tagId)
  }

  const enrolledRows = options.force ? [] : existing
  const enrolledSources = new Set(
    enrolledRows
      .map((row) => String(row.sourcePath || ''))
      .filter(Boolean),
  )

  const existingEmbeddings: Float32Array[] = []
  for (const row of enrolledRows) {
    try {
      existingEmbeddings.push(embeddingFromJson(String(row.embedding)))
    } catch {
      // Ignore corrupt rows.
    }
  }

  let created = 0
  for (const imagePath of imagePaths) {
    if (enrolledRows.length + created >= MAX_ENROLLMENTS_PER_TAG) break
    const sourcePath = toEnrollmentSourcePath(db, imagePath)
    if (enrolledSources.has(sourcePath) || enrolledSources.has(imagePath)) continue
    const ok = await enrollTagImage(db, tagId, metaId, imagePath, 'tagImage', {
      existingEmbeddings,
    })
    if (ok) {
      created += 1
      enrolledSources.add(sourcePath)
    }
  }

  return created
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
  let processed = 0
  let enrolled = 0
  let skipped = 0
  let failed = 0

  yield {type: 'progress', processed, total, remaining: total, enrolled, skipped, failed}

  for (const tag of tags) {
    if (shouldStop()) {
      yield {type: 'complete', processed, total, enrolled, skipped, failed, stopped: true}
      return
    }

    const tagId = Number(tag.id)
    const existing = enrollmentsRepo.findByTagId(tagId)
    const imagePaths = findTagImagePaths(String(db.path), metaId, tagId)

    if (!imagePaths.length) {
      skipped += 1
      processed += 1
      yield {
        type: 'progress',
        processed,
        total,
        remaining: Math.max(total - processed, 0),
        enrolled,
        skipped,
        failed,
        current: tag.name || String(tagId),
      }
      continue
    }

    const existingSources = new Set(
      existing.map((row) => String(row.sourcePath || '')).filter(Boolean),
    )
    const pendingPaths = force
      ? imagePaths
      : imagePaths.filter((imagePath) => {
        const sourcePath = toEnrollmentSourcePath(db, imagePath)
        return !existingSources.has(sourcePath) && !existingSources.has(imagePath)
      })

    if (!pendingPaths.length) {
      skipped += 1
      processed += 1
      yield {
        type: 'progress',
        processed,
        total,
        remaining: Math.max(total - processed, 0),
        enrolled,
        skipped,
        failed,
        current: tag.name || String(tagId),
      }
      continue
    }

    try {
      const created = await enrollTagFromAllImages(db, tagId, metaId, imagePaths, {force})
      if (created > 0) enrolled += 1
      else skipped += 1
    } catch {
      failed += 1
    }

    processed += 1
    yield {
      type: 'progress',
      processed,
      total,
      remaining: Math.max(total - processed, 0),
      enrolled,
      skipped,
      failed,
      current: tag.name || String(tagId),
    }
  }

  yield {type: 'complete', processed, total, enrolled, skipped, failed, stopped: false}
}

function scoreEnrollmentTags(
  embedding: Float32Array,
  enrollments: Array<{tagId: number; embedding: string | Float32Array}>,
): Map<number, number> {
  const scoresByTag = new Map<number, number[]>()

  for (const enrollment of enrollments) {
    const tagId = Number(enrollment.tagId)
    if (!Number.isFinite(tagId) || tagId <= 0) continue
    const ref = typeof enrollment.embedding === 'string'
      ? embeddingFromJson(enrollment.embedding)
      : enrollment.embedding
    if (!ref?.length) continue
    const score = cosineSimilarity(embedding, ref)
    const list = scoresByTag.get(tagId)
    if (list) list.push(score)
    else scoresByTag.set(tagId, [score])
  }

  const result = new Map<number, number>()
  for (const [tagId, scores] of scoresByTag) {
    scores.sort((a, b) => b - a)
    // Max keeps recall; when 2+ gallery shots exist, blend top-2 to cut lucky noise.
    result.set(
      tagId,
      scores.length === 1 ? scores[0] : (scores[0] * 0.7) + (scores[1] * 0.3),
    )
  }
  return result
}

function parseEnrollmentRefs(
  enrollments: Array<{tagId: number; embedding: string}>,
): Array<{tagId: number; embedding: Float32Array}> {
  const parsed: Array<{tagId: number; embedding: Float32Array}> = []
  for (const enrollment of enrollments) {
    const tagId = Number(enrollment.tagId)
    if (!Number.isFinite(tagId) || tagId <= 0) continue
    try {
      const embedding = embeddingFromJson(String(enrollment.embedding || ''))
      if (!embedding.length) continue
      parsed.push({tagId, embedding})
    } catch {
      // Skip corrupt gallery vectors.
    }
  }
  return parsed
}

function findTopEnrollmentMatches(
  embedding: Float32Array,
  enrollments: Array<{tagId: number; embedding: string | Float32Array}>,
  limit = DEFAULT_CANDIDATE_LIMIT,
) {
  return [...scoreEnrollmentTags(embedding, enrollments).entries()]
    .map(([tagId, score]) => ({tagId, score}))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit))
}

/**
 * Rank people using every frame in a cluster (not only the centroid).
 * Best-frame recall recovers identity when some crops are blurry/angled;
 * a short consistency blend reduces one-off false peaks.
 */
function findTopEnrollmentMatchesForEmbeddings(
  embeddings: Array<Float32Array | null | undefined>,
  enrollments: Array<{tagId: number; embedding: string | Float32Array}>,
  limit = DEFAULT_CANDIDATE_LIMIT,
) {
  const usable = embeddings.filter((item): item is Float32Array => Boolean(item && item.length))
  if (!usable.length) return []

  const frameScoresByTag = new Map<number, number[]>()
  for (const embedding of usable) {
    for (const [tagId, score] of scoreEnrollmentTags(embedding, enrollments)) {
      const list = frameScoresByTag.get(tagId) || []
      list.push(score)
      frameScoresByTag.set(tagId, list)
    }
  }

  const centroid = averageEmbeddings(usable)
  const centroidScores = centroid ? scoreEnrollmentTags(centroid, enrollments) : null

  return [...frameScoresByTag.entries()]
    .map(([tagId, scores]) => {
      scores.sort((a, b) => b - a)
      const best = scores[0]
      const topCount = Math.min(3, scores.length)
      let consistency = 0
      for (let i = 0; i < topCount; i++) consistency += scores[i]
      consistency /= topCount
      const centroidScore = centroidScores?.get(tagId) ?? 0
      // Prefer a real strong frame hit; centroid only stabilizes mid scores.
      const score = Math.max(best, centroidScore) * 0.7 + consistency * 0.3
      return {tagId, score}
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit))
}

/** Require a clear winner so near-ties do not become false positives. */
const MATCH_SCORE_MARGIN = 0.08

function pickMatchFromCandidates(
  candidates: Array<{tagId: number; score: number}>,
  minConfidence: number,
) {
  const best = candidates[0]
  if (!best || best.score < minConfidence) {
    return {accepted: false as const, best, ambiguous: false}
  }
  const second = candidates[1]
  const ambiguous = Boolean(second && (best.score - second.score) < MATCH_SCORE_MARGIN)
  return {accepted: !ambiguous, best, ambiguous}
}

async function matchMediaFaces(
  db: ApiDb,
  mediaId: number,
  options: {force?: boolean; settings?: FaceMatchSettings} = {},
) {
  const settings = options.settings || getFaceMatchSettings(db)
  const metaId = settings.performerMetaId
  if (!metaId) {
    return {matched: 0, applied: 0, skipped: 0, faces: 0, error: 'Performer category is not configured.'}
  }

  const facesRepo = createFacesRepository(db.drizzle)
  const faces = facesRepo.findByMediaId(mediaId)
  if (!faces.length) return {matched: 0, applied: 0, skipped: 0, faces: 0}

  const enrollments = parseEnrollmentRefs(
    createFaceEnrollmentsRepository(db.drizzle).findByMetaId(metaId),
  )
  if (!enrollments.length) {
    return {matched: 0, applied: 0, skipped: faces.length, faces: faces.length, error: 'No enrolled performer faces.'}
  }

  await loadEmbedModel(db)

  let matched = 0
  let applied = 0
  let skipped = 0
  const tagsToApply: Array<{mediaId: number; tagId: number; metaId: number}> = []

  type PreparedFace = {
    id: number
    tagId: number | null
    matchScore: number | null
    score: number
    timestamp: string | null
    skip: boolean
    candidates?: Array<{tagId: number; score: number}>
    embedding?: Float32Array | null
  }

  const prepared: PreparedFace[] = []

  for (const face of faces) {
    const faceId = Number(face.id)
    const timestamp = face.timestamp ?? null
    if (face.tagId && !options.force) {
      skipped += 1
      prepared.push({
        id: faceId,
        tagId: Number(face.tagId),
        matchScore: face.matchScore,
        score: Number(face.score) || 0,
        timestamp,
        skip: true,
        embedding: null,
      })
      continue
    }

    if (!isMatchableStoredFace(face)) {
      skipped += 1
      prepared.push({
        id: faceId,
        tagId: null,
        matchScore: null,
        score: Number(face.score) || 0,
        timestamp,
        skip: true,
        embedding: null,
      })
      continue
    }

    try {
      const embedding = await loadFaceEmbedding(db, face)
      if (!embedding) {
        skipped += 1
        prepared.push({
          id: faceId,
          tagId: null,
          matchScore: null,
          score: Number(face.score) || 0,
          timestamp,
          skip: true,
          embedding: null,
        })
        continue
      }
      const candidates = findTopEnrollmentMatches(embedding, enrollments, settings.candidateLimit)
      prepared.push({
        id: faceId,
        tagId: null,
        matchScore: null,
        score: Number(face.score) || 0,
        timestamp,
        skip: false,
        candidates,
        embedding,
      })
    } catch {
      skipped += 1
      prepared.push({
        id: faceId,
        tagId: null,
        matchScore: null,
        score: Number(face.score) || 0,
        timestamp,
        skip: true,
        embedding: null,
      })
    }
  }

  const clustered = clusterFacesInMedia(prepared)
  const handledClusters = new Set<number>()

  for (const face of clustered) {
    if (face.skip || handledClusters.has(face.clusterId)) continue
    handledClusters.add(face.clusterId)

    const members = clustered.filter((entry) => entry.clusterId === face.clusterId && !entry.skip)
    if (!members.length) continue

    const centroid = averageEmbeddings(members.map((member) => member.embedding))
    const queryEmbeddings = [
      ...members.map((member) => member.embedding),
      centroid,
    ]
    const candidates = findTopEnrollmentMatchesForEmbeddings(
      queryEmbeddings,
      enrollments,
      settings.candidateLimit,
    )
    const pick = pickMatchFromCandidates(candidates, settings.minConfidence)

    for (const member of members) {
      if (pick.best && pick.accepted) {
        facesRepo.updateMatch(member.id, {
          tagId: pick.best.tagId,
          matchScore: pick.best.score,
          matchStatus: settings.mode === 'auto' ? 'matched' : 'suggested',
        })
        matched += 1
        if (settings.mode === 'auto') {
          tagsToApply.push({mediaId, tagId: pick.best.tagId, metaId})
        }
      } else if (pick.best && pick.ambiguous) {
        facesRepo.updateMatch(member.id, {
          tagId: pick.best.tagId,
          matchScore: pick.best.score,
          matchStatus: 'suggested',
        })
        matched += 1
      } else {
        facesRepo.updateMatch(member.id, {
          tagId: null,
          matchScore: pick.best && pick.best.score > 0 ? pick.best.score : null,
          matchStatus: 'unmatched',
        })
      }
    }
  }

  if (tagsToApply.length) {
    const unique = new Map<string, {mediaId: number; tagId: number; metaId: number}>()
    for (const item of tagsToApply) unique.set(`${item.mediaId}:${item.tagId}:${item.metaId}`, item)
    createTagsInMediaRepository(db.drizzle).bulkCreate([...unique.values()])
    applied = unique.size
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
  const matchScore = options.matchScore != null
    ? Number(options.matchScore)
    : (applyTag ? 1 : (Number(face.matchScore) || 1))
  facesRepo.updateMatch(faceId, {
    tagId,
    matchScore,
    // Draft pick stays suggested until the user commits tags to media.
    matchStatus: applyTag ? 'manual' : 'suggested',
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

  facesRepo.updateMatch(faceId, {
    tagId: null,
    matchScore: null,
    matchStatus: 'unmatched',
  })

  return {
    faceId,
    mediaId: Number(face.mediaId),
    tagId: null,
    matchStatus: 'unmatched',
  }
}

/** Same-person link for different poses/lighting in one video (R50 + landmark align). */
const FACE_CLUSTER_SIMILARITY = 0.34
/** Softer link when neither face has an assigned tag yet. */
const FACE_CLUSTER_UNMATCHED_SIMILARITY = 0.28
/** Even softer when two unmatched faces are close in time (open-mouth / profile drift). */
const FACE_CLUSTER_TEMPORAL_SIMILARITY = 0.22
/** Seconds between timestamps to use the temporal threshold. */
const FACE_CLUSTER_TEMPORAL_WINDOW_SEC = 20
/** Soft gate when both faces share a gallery tag suggestion. */
const FACE_CLUSTER_CANDIDATE_SCORE = 0.28

function parseFaceTimestampSeconds(value: string | null | undefined): number | null {
  if (!value) return null
  const parts = String(value).trim().split(':').map((part) => Number(part))
  if (parts.length === 3 && parts.every((part) => Number.isFinite(part))) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  if (parts.length === 2 && parts.every((part) => Number.isFinite(part))) {
    return parts[0] * 60 + parts[1]
  }
  const asNumber = Number(value)
  return Number.isFinite(asNumber) ? asNumber : null
}

function clusterFacesInMedia<T extends {
  id: number
  tagId: number | null
  matchScore: number | null
  score: number
  timestamp?: string | null
  candidates?: Array<{tagId: number; score: number}>
  embedding?: Float32Array | null
}>(items: T[]) {
  const n = items.length
  if (!n) return [] as Array<T & {
    clusterId: number
    clusterFaceIds: number[]
    clusterSize: number
    clusterRepresentative: boolean
  }>

  const parent = Array.from({length: n}, (_, index) => index)
  const find = (index: number): number => {
    let current = index
    while (parent[current] !== current) current = parent[current]
    let cursor = index
    while (parent[cursor] !== current) {
      const next = parent[cursor]
      parent[cursor] = current
      cursor = next
    }
    return current
  }
  const union = (a: number, b: number) => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent[rootB] = rootA
  }

  const topCandidate = (item: T) => {
    const best = item.candidates?.[0]
    if (!best || !Number.isFinite(best.tagId) || best.tagId <= 0) return null
    return best
  }

  const sharesCandidate = (left: T, right: T) => {
    const leftScores = new Map<number, number>()
    for (const candidate of left.candidates || []) {
      if (!candidate?.tagId || candidate.tagId <= 0) continue
      if (candidate.score < FACE_CLUSTER_CANDIDATE_SCORE) continue
      leftScores.set(candidate.tagId, candidate.score)
    }
    if (!leftScores.size) return false
    for (const candidate of right.candidates || []) {
      if (!candidate?.tagId || candidate.tagId <= 0) continue
      if (candidate.score < FACE_CLUSTER_CANDIDATE_SCORE) continue
      if (leftScores.has(candidate.tagId)) return true
    }
    return false
  }

  const embeddingThreshold = (left: T, right: T) => {
    const leftTag = left.tagId != null && left.tagId > 0 ? left.tagId : null
    const rightTag = right.tagId != null && right.tagId > 0 ? right.tagId : null
    // Never soft-merge faces that already disagree on assigned people.
    if (leftTag && rightTag && leftTag !== rightTag) return Number.POSITIVE_INFINITY

    const bothUnmatched = !leftTag && !rightTag
    if (bothUnmatched) {
      const leftTs = parseFaceTimestampSeconds(left.timestamp)
      const rightTs = parseFaceTimestampSeconds(right.timestamp)
      if (
        leftTs != null
        && rightTs != null
        && Math.abs(leftTs - rightTs) <= FACE_CLUSTER_TEMPORAL_WINDOW_SEC
      ) {
        return FACE_CLUSTER_TEMPORAL_SIMILARITY
      }
      return FACE_CLUSTER_UNMATCHED_SIMILARITY
    }
    return FACE_CLUSTER_SIMILARITY
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const left = items[i]
      const right = items[j]
      const leftTag = left.tagId != null && left.tagId > 0 ? left.tagId : null
      const rightTag = right.tagId != null && right.tagId > 0 ? right.tagId : null

      if (leftTag && rightTag && leftTag === rightTag) {
        union(i, j)
        continue
      }

      // Conflicting assigned tags stay separate.
      if (leftTag && rightTag && leftTag !== rightTag) continue

      // Assigned tag on one side + matching suggestion on the other.
      if (leftTag) {
        const rightHit = (right.candidates || []).find((candidate) => (
          candidate.tagId === leftTag && candidate.score >= FACE_CLUSTER_CANDIDATE_SCORE
        ))
        if (rightHit) {
          union(i, j)
          continue
        }
      }
      if (rightTag) {
        const leftHit = (left.candidates || []).find((candidate) => (
          candidate.tagId === rightTag && candidate.score >= FACE_CLUSTER_CANDIDATE_SCORE
        ))
        if (leftHit) {
          union(i, j)
          continue
        }
      }

      const leftCand = topCandidate(left)
      const rightCand = topCandidate(right)
      if (
        leftCand
        && rightCand
        && leftCand.tagId === rightCand.tagId
        && leftCand.score >= FACE_CLUSTER_CANDIDATE_SCORE
        && rightCand.score >= FACE_CLUSTER_CANDIDATE_SCORE
      ) {
        union(i, j)
        continue
      }

      if (sharesCandidate(left, right)) {
        union(i, j)
        continue
      }

      if (left.embedding && right.embedding) {
        const similarity = cosineSimilarity(left.embedding, right.embedding)
        if (similarity >= embeddingThreshold(left, right)) union(i, j)
      }
    }
  }

  const groups = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const root = find(i)
    const list = groups.get(root) || []
    list.push(i)
    groups.set(root, list)
  }

  const quality = (item: T) => {
    const match = Number(item.matchScore)
    const detection = Number(item.score)
    return (Number.isFinite(match) ? match : 0) * 10 + (Number.isFinite(detection) ? detection : 0)
  }

  const result: Array<T & {
    clusterId: number
    clusterFaceIds: number[]
    clusterSize: number
    clusterRepresentative: boolean
  }> = []

  let clusterSeq = 1
  for (const indexes of groups.values()) {
    const clusterId = clusterSeq
    clusterSeq += 1
    const clusterFaceIds = indexes.map((index) => Number(items[index].id))
    let bestIndex = indexes[0]
    for (const index of indexes) {
      if (quality(items[index]) > quality(items[bestIndex])) bestIndex = index
    }
    for (const index of indexes) {
      result[index] = {
        ...items[index],
        clusterId,
        clusterFaceIds,
        clusterSize: clusterFaceIds.length,
        clusterRepresentative: index === bestIndex,
      }
    }
  }

  return result
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

  const prepared: Array<{
    id: number
    mediaId: number
    timestamp: string | null
    score: number
    x: number
    y: number
    width: number
    height: number
    cropPath: string | null
    tagId: number | null
    matchScore: number | null
    matchStatus: string | null
    createdAt: string | null
    tagName: string | null
    tagMetaId: number | null
    candidates: Array<{tagId: number; score: number; tagName: string | null; tagMetaId: number | null}>
    embedding: Float32Array | null
  }> = []

  for (const face of faceRows) {
    let candidates: Array<{tagId: number; score: number; tagName: string | null; tagMetaId: number | null}> = []
    let embedding: Float32Array | null = null
    if (face.embedding) {
      try {
        embedding = embeddingFromJson(String(face.embedding))
      } catch {
        embedding = null
      }
    }
    if (embedding && enrollmentRefs.length && isMatchableStoredFace(face)) {
      const top = findTopEnrollmentMatches(embedding, enrollmentRefs, settings.candidateLimit)
      candidates = top.map((item) => {
        const tag = resolveTag(item.tagId)
        return {
          tagId: item.tagId,
          score: item.score,
          tagName: tag?.name ?? null,
          tagMetaId: tag?.metaId != null ? Number(tag.metaId) : null,
        }
      })
    }

    const assignedTagId = face.tagId != null ? Number(face.tagId) : null
    const primaryTagId = assignedTagId ?? (candidates[0]?.tagId ?? null)
    const tag = primaryTagId != null ? resolveTag(primaryTagId) : undefined
    prepared.push({
      id: Number(face.id),
      mediaId: Number(face.mediaId),
      timestamp: face.timestamp,
      score: face.score,
      x: face.x,
      y: face.y,
      width: face.width,
      height: face.height,
      cropPath: face.cropPath,
      tagId: assignedTagId,
      matchScore: face.matchScore,
      matchStatus: face.matchStatus,
      createdAt: face.createdAt,
      tagName: assignedTagId != null ? (tag?.name ?? null) : null,
      tagMetaId: assignedTagId != null && tag?.metaId != null ? Number(tag.metaId) : null,
      candidates,
      embedding,
    })
  }

  const clustered = clusterFacesInMedia(prepared)

  // Re-rank candidates from all frames in the cluster (best-frame + consistency).
  if (enrollmentRefs.length) {
    const byCluster = new Map<number, typeof clustered>()
    for (const face of clustered) {
      const list = byCluster.get(face.clusterId) || []
      list.push(face)
      byCluster.set(face.clusterId, list)
    }

    for (const members of byCluster.values()) {
      const queryEmbeddings = [
        ...members.map((member) => member.embedding),
        averageEmbeddings(members.map((member) => member.embedding)),
      ]
      const top = findTopEnrollmentMatchesForEmbeddings(
        queryEmbeddings,
        enrollmentRefs,
        settings.candidateLimit,
      )
      if (!top.length) continue
      const candidates = top.map((item) => {
        const tag = resolveTag(item.tagId)
        return {
          tagId: item.tagId,
          score: item.score,
          tagName: tag?.name ?? null,
          tagMetaId: tag?.metaId != null ? Number(tag.metaId) : null,
        }
      })
      for (const member of members) {
        member.candidates = candidates
      }
    }
  }

  const faces = clustered.map(({embedding: _embedding, ...face}) => face)

  return {mediaId, faces}
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
  let processed = 0
  let matched = 0
  let applied = 0
  let skipped = 0
  let failed = 0

  yield {type: 'progress', processed, total, remaining: total, matched, applied, skipped, failed}

  for (const mediaId of ids) {
    if (shouldStop()) {
      yield {
        type: 'complete',
        processed,
        total,
        matched,
        applied,
        skipped,
        failed,
        stopped: true,
      }
      return
    }

    try {
      const result = await matchMediaFaces(db, Number(mediaId), {force, settings})
      matched += result.matched
      applied += result.applied
      skipped += result.skipped
      if (result.error && !result.faces) failed += 1
    } catch {
      failed += 1
    }

    processed += 1
    const media = mediaRepo.findById(Number(mediaId))
    yield {
      type: 'progress',
      processed,
      total,
      remaining: Math.max(total - processed, 0),
      matched,
      applied,
      skipped,
      failed,
      current: media?.path || String(mediaId),
    }
  }

  yield {
    type: 'complete',
    processed,
    total,
    matched,
    applied,
    skipped,
    failed,
    stopped: false,
  }
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
  if (!tag?.metaId) {
    return {tagId, metaId: 0, created: 0, skipped: true, reason: 'tag_not_found'}
  }

  const metaId = Number(tag.metaId)
  const settings = getFaceMatchSettings(db)
  if (!settings.performerMetaId || settings.performerMetaId !== metaId) {
    return {tagId, metaId, created: 0, skipped: true, reason: 'not_people_category'}
  }

  const imagePaths = findTagImagePaths(String(db.path), metaId, tagId)
  if (!imagePaths.length) {
    // Photo removed — clear stale references for this tag.
    if (options.force !== false) {
      createFaceEnrollmentsRepository(db.drizzle).deleteByTagId(tagId)
    }
    return {tagId, metaId, created: 0, skipped: false}
  }

  await loadDetectionModel(db)
  await loadEmbedModel(db)
  const created = await enrollTagFromAllImages(db, tagId, metaId, imagePaths, {
    force: options.force !== false,
  })
  return {tagId, metaId, created, skipped: false}
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
