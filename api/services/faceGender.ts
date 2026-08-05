import type { ApiDb } from '../types/db'
import type { FaceBox } from '../types/faceDetector'
import { Jimp } from 'jimp'
import {
  applyAffine,
  buildScaleTranslate,
  invertAffine,
  type Affine2x3,
} from './faceAlignMath'
import {
  GENDER_MIN_CONFIDENCE,
  normalizeGenderFilter,
  passesGenderFilter,
  softmax2,
  type FaceGender,
  type FaceGenderFilter,
} from './faceGenderFilter'
import {
  ensureCachedModelFile,
  getOrt,
  resolveCachedModelPath,
  type OrtSession,
} from './faceOrtRuntime'

const GENDER_MODEL_ID = 'insightface-genderage'
const GENDER_MODEL_FILENAME = 'genderage.onnx'
const GENDER_MODEL_URL = 'https://huggingface.co/deepghs/insightface/resolve/main/buffalo_l/genderage.onnx'
/** Rough size shown in UI (~buffalo_l genderage). */
const GENDER_MODEL_SIZE_MB = 1.3
const GENDER_MEAN = 127.5
const GENDER_STD = 128
/** InsightFace default when session metadata is unavailable. */
const DEFAULT_INPUT_SIZE = 96

export type {FaceGender, FaceGenderFilter}

export interface FaceGenderEstimate {
  gender: FaceGender
  age: number
  /** Softmax confidence of the predicted gender class (0–1). */
  confidence: number
}

type JimpImage = Awaited<ReturnType<typeof Jimp.read>>

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
}

async function* prepareGenderModel(db: ApiDb): AsyncGenerator<GenderPrepEvent> {
  const needsDownload = !hasDownloadedGenderModel(db)
  if (needsDownload) {
    yield {
      type: 'status',
      phase: 'downloading_gender',
      message: `Downloading face gender model (~${GENDER_MODEL_SIZE_MB} MB)…`,
      sizeMb: GENDER_MODEL_SIZE_MB,
    }
  }
  await loadGenderModel(db)
  if (needsDownload) {
    yield {
      type: 'status',
      phase: 'gender_ready',
      message: 'Face gender model downloaded.',
      sizeMb: GENDER_MODEL_SIZE_MB,
    }
  }
}

function sampleBilinear(image: JimpImage, x: number, y: number): [number, number, number] {
  const clampX = Math.max(0, Math.min(image.width - 1, x))
  const clampY = Math.max(0, Math.min(image.height - 1, y))
  const x0 = Math.floor(clampX)
  const y0 = Math.floor(clampY)
  const x1 = Math.min(image.width - 1, x0 + 1)
  const y1 = Math.min(image.height - 1, y0 + 1)
  const dx = clampX - x0
  const dy = clampY - y0
  const {data} = image.bitmap
  const i00 = (y0 * image.width + x0) * 4
  const i01 = (y0 * image.width + x1) * 4
  const i10 = (y1 * image.width + x0) * 4
  const i11 = (y1 * image.width + x1) * 4
  const out: [number, number, number] = [0, 0, 0]
  for (let c = 0; c < 3; c++) {
    out[c] = (
      data[i00 + c] * (1 - dx) * (1 - dy)
      + data[i01 + c] * dx * (1 - dy)
      + data[i10 + c] * (1 - dx) * dy
      + data[i11 + c] * dx * dy
    )
  }
  return out
}

/** InsightFace attribute warp → normalized NCHW float blob. */
function warpAffineRgb(
  image: JimpImage,
  M: Affine2x3,
  outW: number,
  outH: number,
): Float32Array {
  const inv = invertAffine(M)
  const plane = outW * outH
  const out = new Float32Array(3 * plane)
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const src = applyAffine(inv, x + 0.5, y + 0.5)
      const [r, g, b] = sampleBilinear(image, src.x, src.y)
      const dst = y * outW + x
      out[dst] = (r - GENDER_MEAN) / GENDER_STD
      out[plane + dst] = (g - GENDER_MEAN) / GENDER_STD
      out[2 * plane + dst] = (b - GENDER_MEAN) / GENDER_STD
    }
  }
  return out
}

/**
 * Predict gender/age for a detected face box (InsightFace genderage).
 * Gender codes match InsightFace: 0 = female, 1 = male.
 */
async function estimateGender(
  image: JimpImage,
  box: FaceBox,
): Promise<FaceGenderEstimate | null> {
  if (!genderSession) return null
  const w = Math.max(1, Number(box.width) || 1)
  const h = Math.max(1, Number(box.height) || 1)
  const centerX = Number(box.x) + w / 2
  const centerY = Number(box.y) + h / 2
  const scale = inputSize / (Math.max(w, h) * 1.5)
  const M = buildScaleTranslate(centerX, centerY, scale, inputSize)
  const blob = warpAffineRgb(image, M, inputSize, inputSize)

  const ort = getOrt()
  const tensor = new ort.Tensor('float32', blob, [1, 3, inputSize, inputSize])
  const outputs = await genderSession.run({[inputName]: tensor})
  const pred = outputs[outputName]
  if (!pred?.data || pred.data.length < 3) return null

  const femaleLogit = Number(pred.data[0])
  const maleLogit = Number(pred.data[1])
  const ageNorm = Number(pred.data[2])
  if (![femaleLogit, maleLogit, ageNorm].every(Number.isFinite)) return null

  const [femaleProb, maleProb] = softmax2(femaleLogit, maleLogit)
  const male = maleProb >= femaleProb
  return {
    gender: male ? 'male' : 'female',
    age: Math.round(ageNorm * 100),
    confidence: male ? maleProb : femaleProb,
  }
}

export {
  GENDER_MIN_CONFIDENCE,
  GENDER_MODEL_ID,
  GENDER_MODEL_SIZE_MB,
  estimateGender,
  hasDownloadedGenderModel,
  loadGenderModel,
  normalizeGenderFilter,
  passesGenderFilter,
  prepareGenderModel,
}
