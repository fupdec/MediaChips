import type { ApiDb } from '../types/db'
import type { FaceBox } from '../types/faceDetector'
import { Jimp } from 'jimp'
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
/** Below this softmax confidence, treat gender as unknown and keep the face. */
const GENDER_MIN_CONFIDENCE = 0.6

export type FaceGender = 'female' | 'male'
export type FaceGenderFilter = 'both' | FaceGender

export interface FaceGenderEstimate {
  gender: FaceGender
  age: number
  /** Softmax confidence of the predicted gender class (0–1). */
  confidence: number
}

type JimpImage = Awaited<ReturnType<typeof Jimp.read>>
type Affine2x3 = [[number, number, number], [number, number, number]]
type Point2 = {x: number; y: number}

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

function normalizeGenderFilter(value: unknown): FaceGenderFilter {
  const raw = String(value ?? 'both').trim().toLowerCase()
  if (raw === 'female' || raw === 'male') return raw
  return 'both'
}

function passesGenderFilter(
  gender: FaceGender | null | undefined,
  filter: FaceGenderFilter,
  confidence?: number | null,
): boolean {
  if (filter === 'both') return true
  // Keep the face when gender is unknown/uncertain so a model blip does not wipe detections.
  if (!gender) return true
  if (confidence != null && Number.isFinite(confidence) && confidence < GENDER_MIN_CONFIDENCE) {
    return true
  }
  return gender === filter
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

/** InsightFace attribute transform with rotate=0. */
function buildScaleTranslate(
  centerX: number,
  centerY: number,
  scale: number,
  outputSize: number,
): Affine2x3 {
  const tx = outputSize / 2 - centerX * scale
  const ty = outputSize / 2 - centerY * scale
  return [
    [scale, 0, tx],
    [0, scale, ty],
  ]
}

function invertAffine(M: Affine2x3): Affine2x3 {
  const [[a, b, tx], [c, d, ty]] = M
  const det = a * d - b * c
  if (Math.abs(det) < 1e-12) {
    return [
      [1, 0, 0],
      [0, 1, 0],
    ]
  }
  const invDet = 1 / det
  const ia = d * invDet
  const ib = -b * invDet
  const ic = -c * invDet
  const id = a * invDet
  return [
    [ia, ib, -(ia * tx + ib * ty)],
    [ic, id, -(ic * tx + id * ty)],
  ]
}

function applyAffine(M: Affine2x3, x: number, y: number): Point2 {
  return {
    x: M[0][0] * x + M[0][1] * y + M[0][2],
    y: M[1][0] * x + M[1][1] * y + M[1][2],
  }
}

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

function softmax2(a: number, b: number): [number, number] {
  const max = Math.max(a, b)
  const ea = Math.exp(a - max)
  const eb = Math.exp(b - max)
  const sum = ea + eb
  return [ea / sum, eb / sum]
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
