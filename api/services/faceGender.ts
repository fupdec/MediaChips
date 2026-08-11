import type { ApiDb } from '../types/db'
import type { FaceBox } from '../types/faceDetector'
import {buildScaleTranslate, type AlignSampleImage} from './faceAlignMath'
import {
  GENDER_MIN_CONFIDENCE,
  normalizeGenderFilter,
  passesGenderFilter,
  type FaceGender,
  type FaceGenderFilter,
} from './faceGenderFilter'
import {
  decodeGenderagePrediction,
  warpGenderAffineRgb,
  type FaceGenderEstimate,
} from './faceGenderWarp'
import {
  downloadCachedModelIfNeeded,
  ensureCachedModelFile,
  getOrt,
  resolveCachedModelPath,
  type OrtSession,
} from './faceOrtRuntime'
import {
  buildCachedModelReadyEvent,
} from './faceModelStatus'

const GENDER_MODEL_ID = 'insightface-genderage'
const GENDER_MODEL_FILENAME = 'genderage.onnx'
const GENDER_MODEL_URL = 'https://huggingface.co/deepghs/insightface/resolve/main/buffalo_l/genderage.onnx'
/** Rough size shown in UI (~buffalo_l genderage). */
const GENDER_MODEL_SIZE_MB = 1.3
/** InsightFace default when session metadata is unavailable. */
const DEFAULT_INPUT_SIZE = 96

export type {FaceGender, FaceGenderFilter, FaceGenderEstimate}
export {GENDER_MIN_CONFIDENCE, normalizeGenderFilter, passesGenderFilter}

let genderSession: OrtSession | null = null
let genderLoading: Promise<OrtSession> | null = null
let inputSize = DEFAULT_INPUT_SIZE
let inputName = 'data'
let outputName = 'fc1'

function hasDownloadedGenderModel(db: ApiDb) {
  return Boolean(resolveCachedModelPath(db, GENDER_MODEL_ID, GENDER_MODEL_FILENAME))
}

async function ensureGenderModelFile(db: ApiDb): Promise<{path: string; downloaded: boolean}> {
  return ensureCachedModelFile(db, {
    modelId: GENDER_MODEL_ID,
    filename: GENDER_MODEL_FILENAME,
    url: GENDER_MODEL_URL,
    errorLabel: 'face gender model',
  })
}

async function loadGenderModel(db: ApiDb): Promise<OrtSession> {
  if (genderSession) return genderSession
  if (genderLoading) return genderLoading

  genderLoading = (async () => {
    const {path: modelPath} = await ensureGenderModelFile(db)
    const ort = getOrt()
    genderSession = await ort.InferenceSession.create(modelPath)
    inputName = genderSession.inputNames[0] || 'data'
    outputName = genderSession.outputNames[0] || 'fc1'
    inputSize = DEFAULT_INPUT_SIZE
    return genderSession
  })()

  try {
    return await genderLoading
  } finally {
    genderLoading = null
  }
}

type GenderPrepEvent = {
  type: 'status'
  phase: 'downloading_gender' | 'gender_ready'
  message: string
  sizeMb?: number
  percent?: number
  loaded?: number
  total?: number | null
  etaSeconds?: number | null
}

async function* prepareGenderModel(
  db: ApiDb,
  options: {shouldStop?: () => boolean} = {},
): AsyncGenerator<GenderPrepEvent> {
  const needsDownload = !hasDownloadedGenderModel(db)
  if (needsDownload) {
    for await (const event of downloadCachedModelIfNeeded(db, {
      modelId: GENDER_MODEL_ID,
      filename: GENDER_MODEL_FILENAME,
      url: GENDER_MODEL_URL,
      errorLabel: 'face gender model',
      expectedBytes: Math.round(GENDER_MODEL_SIZE_MB * 1024 * 1024),
      label: 'face gender',
      phase: 'downloading_gender',
      shouldStop: options.shouldStop,
    })) {
      yield {
        ...event,
        sizeMb: GENDER_MODEL_SIZE_MB,
      }
    }
  }
  await loadGenderModel(db)
  if (needsDownload) {
    yield buildCachedModelReadyEvent({
      phase: 'gender_ready',
      sizeMb: GENDER_MODEL_SIZE_MB,
      kind: 'face gender',
    })
  }
}

/**
 * Predict gender/age for a detected face box (InsightFace genderage).
 * Gender codes match InsightFace: 0 = female, 1 = male.
 */
async function estimateGender(
  image: AlignSampleImage,
  box: FaceBox,
): Promise<FaceGenderEstimate | null> {
  if (!genderSession) return null
  const w = Math.max(1, Number(box.width) || 1)
  const h = Math.max(1, Number(box.height) || 1)
  const centerX = Number(box.x) + w / 2
  const centerY = Number(box.y) + h / 2
  const scale = inputSize / (Math.max(w, h) * 1.5)
  const M = buildScaleTranslate(centerX, centerY, scale, inputSize)
  const blob = warpGenderAffineRgb(image, M, inputSize, inputSize)

  const ort = getOrt()
  const tensor = new ort.Tensor('float32', blob, [1, 3, inputSize, inputSize])
  const outputs = await genderSession.run({[inputName]: tensor})
  const pred = outputs[outputName]
  if (!pred?.data) return null
  return decodeGenderagePrediction(pred.data as ArrayLike<number>)
}

export {
  GENDER_MODEL_ID,
  GENDER_MODEL_SIZE_MB,
  estimateGender,
  hasDownloadedGenderModel,
  loadGenderModel,
  prepareGenderModel,
}
