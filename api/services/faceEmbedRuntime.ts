/** ArcFace embed session + encode — no dependency on faceDetector / faceRecognition. */

import type {ApiDb} from '../types/db'
import type {ModelStatus} from '../types/mlModels'
import type {FaceBox, FaceLandmark5} from '../types/faceDetector'
import {Jimp} from 'jimp'
import {createFaceEnrollmentsRepository} from '../db/repositories/faceEnrollments'
import {createFacesRepository} from '../db/repositories/faces'
import {createSettingsRepository} from '../db/repositories/settings'
import {alignFaceRgb112} from './faceAlign'
import {l2Normalize} from './faceMatchScoring'
import {
  buildCachedModelDownloadEvent,
  buildCachedModelReadyEvent,
  resolveCachedModelStatus,
} from './faceModelStatus'
import {rgbaBitmapToInterleavedRgb} from './faceTensorPrep'
import {
  EMBED_SIZE,
  buildEmbedFloatData,
  shouldAlignForEmbed,
} from './faceEmbedPrep'
import {
  ensureCachedModelFile,
  getFaceModelCacheDir,
  getOrt,
  resolveCachedModelPath,
  type OrtSession,
} from './faceOrtRuntime'

export const EMBED_MODEL_ID = 'insightface-r50'
/** Bump when preprocess/ranking/model changes so stale enrollments are wiped. */
const EMBED_SPACE_ID = 'insightface-r50-scrfd-kps-v1'
const EMBED_MODEL_FILENAME = 'w600k_r50.onnx'
const EMBED_MODEL_URL = 'https://huggingface.co/deepghs/insightface/resolve/main/buffalo_l/w600k_r50.onnx'
const EMBED_MODEL_SETTING = 'faceMatch.embedModelId'
/** Rough download size shown in UI copy (~buffalo_l recognition head). */
export const EMBED_MODEL_SIZE_MB = 170

export type EmbedPrepEvent = {
  type: 'status'
  phase: 'downloading_embed' | 'downloading_align' | 'embed_ready'
  message: string
  sizeMb?: number
}

let embedSession: OrtSession | null = null
let loadingPromise: Promise<OrtSession> | null = null
let lastError: Error | null = null

const getWritableModelCacheDir = (db: ApiDb) => getFaceModelCacheDir(db, EMBED_MODEL_ID)

const getModelPath = (db: ApiDb) =>
  resolveCachedModelPath(db, EMBED_MODEL_ID, EMBED_MODEL_FILENAME)

export function hasDownloadedEmbedModel(db: ApiDb) {
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

export async function loadEmbedModel(db: ApiDb): Promise<OrtSession> {
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

export async function* prepareEmbedModel(db: ApiDb): AsyncGenerator<EmbedPrepEvent> {
  migrateEmbedModelIfNeeded(db)

  const needsDownload = !hasDownloadedEmbedModel(db)
  if (needsDownload) {
    yield buildCachedModelDownloadEvent({
      phase: 'downloading_embed',
      sizeMb: EMBED_MODEL_SIZE_MB,
      kind: 'face recognition',
    })
  }
  await loadEmbedModel(db)
  if (needsDownload) {
    yield buildCachedModelReadyEvent({
      phase: 'embed_ready',
      sizeMb: EMBED_MODEL_SIZE_MB,
      kind: 'face recognition',
    })
  }
}

export function getEmbedStatus(db: ApiDb): ModelStatus {
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

function rgbToEmbedTensor(rgb: Uint8Array, width: number, height: number) {
  const ort = getOrt()
  return new ort.Tensor('float32', buildEmbedFloatData(rgb, width, height), [1, 3, height, width])
}

async function imageToEmbedTensorLetterbox(imagePath: string) {
  const image = await Jimp.read(imagePath)
  const resized = image.clone().contain({w: EMBED_SIZE, h: EMBED_SIZE})
  const rgb = rgbaBitmapToInterleavedRgb(resized.bitmap.data, EMBED_SIZE * EMBED_SIZE)
  return rgbToEmbedTensor(rgb, EMBED_SIZE, EMBED_SIZE)
}

export async function embedImage(
  db: ApiDb,
  imagePath: string,
  box?: FaceBox | null,
  kps?: FaceLandmark5 | null,
): Promise<Float32Array> {
  const model = await loadEmbedModel(db)
  let tensor
  if (shouldAlignForEmbed(box)) {
    try {
      const image = await Jimp.read(imagePath)
      const aligned = await alignFaceRgb112(db, image, box!, kps)
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
