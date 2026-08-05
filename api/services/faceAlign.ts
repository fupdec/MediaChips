import type { ApiDb } from '../types/db'
import type { FaceBox, FaceLandmark5 } from '../types/faceDetector'
import { Jimp } from 'jimp'
import {
  applyAffine,
  buildScaleTranslate,
  estimateSimilarity,
  estimateSimilarityFromEyes,
  invertAffine,
  landmarks106To5,
  warpAffineRgb,
  type Point2,
} from './faceAlignMath'
import {
  ensureCachedModelFile,
  getOrt,
  resolveCachedModelPath,
  type OrtSession,
} from './faceOrtRuntime'

const LANDMARK_MODEL_ID = 'insightface-2d106'
const LANDMARK_MODEL_FILENAME = '2d106det.onnx'
const LANDMARK_MODEL_URL = 'https://huggingface.co/deepghs/insightface/resolve/main/buffalo_l/2d106det.onnx'
const LANDMARK_SIZE = 192
const LANDMARK_MEAN = 127.5
const LANDMARK_STD = 128
/** InsightFace ArcFace 112 template (left eye, right eye, nose, left mouth, right mouth). */
const ARCFACE_DST = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
] as const

type JimpImage = Awaited<ReturnType<typeof Jimp.read>>

let landmarkSession: OrtSession | null = null
let landmarkLoading: Promise<OrtSession> | null = null

function hasDownloadedLandmarkModel(db: ApiDb) {
  return Boolean(resolveCachedModelPath(db, LANDMARK_MODEL_ID, LANDMARK_MODEL_FILENAME))
}

async function ensureLandmarkModelFile(db: ApiDb): Promise<{path: string; downloaded: boolean}> {
  return ensureCachedModelFile(db, {
    modelId: LANDMARK_MODEL_ID,
    filename: LANDMARK_MODEL_FILENAME,
    url: LANDMARK_MODEL_URL,
    errorLabel: 'face landmark model',
  })
}

async function loadLandmarkModel(db: ApiDb): Promise<OrtSession> {
  if (landmarkSession) return landmarkSession
  if (landmarkLoading) return landmarkLoading

  landmarkLoading = (async () => {
    const {path: modelPath} = await ensureLandmarkModelFile(db)
    const ort = getOrt()
    landmarkSession = await ort.InferenceSession.create(modelPath)
    return landmarkSession
  })()

  try {
    return await landmarkLoading
  } finally {
    landmarkLoading = null
  }
}

async function detectLandmarks5(
  db: ApiDb,
  image: JimpImage,
  box: FaceBox,
): Promise<Point2[] | null> {
  const session = await loadLandmarkModel(db)
  const w = Math.max(1, box.width)
  const h = Math.max(1, box.height)
  const centerX = box.x + w / 2
  const centerY = box.y + h / 2
  const scale = LANDMARK_SIZE / (Math.max(w, h) * 1.5)
  const M = buildScaleTranslate(centerX, centerY, scale, LANDMARK_SIZE)
  const cropped = warpAffineRgb(image, M, LANDMARK_SIZE, LANDMARK_SIZE)

  const floatData = new Float32Array(1 * 3 * LANDMARK_SIZE * LANDMARK_SIZE)
  for (let i = 0; i < LANDMARK_SIZE * LANDMARK_SIZE; i++) {
    const r = cropped[i * 3]
    const g = cropped[i * 3 + 1]
    const b = cropped[i * 3 + 2]
    floatData[i] = (r - LANDMARK_MEAN) / LANDMARK_STD
    floatData[LANDMARK_SIZE * LANDMARK_SIZE + i] = (g - LANDMARK_MEAN) / LANDMARK_STD
    floatData[2 * LANDMARK_SIZE * LANDMARK_SIZE + i] = (b - LANDMARK_MEAN) / LANDMARK_STD
  }

  const ort = getOrt()
  const inputName = session.inputNames[0] || 'data'
  const outputs = await session.run({
    [inputName]: new ort.Tensor('float32', floatData, [1, 3, LANDMARK_SIZE, LANDMARK_SIZE]),
  })
  const predTensor = outputs[session.outputNames[0]]
  if (!predTensor) return null
  const raw = Array.from(predTensor.data as Float32Array)
  if (raw.length < 212) return null

  const inv = invertAffine(M)
  const points: Point2[] = []
  for (let i = 0; i < 106; i++) {
    const px = (raw[i * 2] + 1) * (LANDMARK_SIZE / 2)
    const py = (raw[i * 2 + 1] + 1) * (LANDMARK_SIZE / 2)
    points.push(applyAffine(inv, px, py))
  }
  return landmarks106To5(points)
}

/**
 * Align face to ArcFace 112×112 RGB buffer.
 * Prefer SCRFD 5-point landmarks when available; fall back to 2d106 only if already cached.
 */
async function alignFaceRgb112(
  db: ApiDb,
  image: JimpImage,
  box: FaceBox,
  landmarks5?: FaceLandmark5 | null,
): Promise<Uint8Array | null> {
  let points: Point2[] | null = null
  if (landmarks5 && landmarks5.length >= 5) {
    points = landmarks5.map((p) => ({x: p.x, y: p.y}))
  } else if (hasDownloadedLandmarkModel(db)) {
    try {
      points = await detectLandmarks5(db, image, box)
    } catch {
      points = null
    }
  }
  if (!points || points.length < 5) return null
  const dst = ARCFACE_DST.map(([x, y]) => ({x, y}))
  const M = estimateSimilarity(points, dst) || estimateSimilarityFromEyes(points, dst)
  if (!M) return null
  return warpAffineRgb(image, M, 112, 112)
}

async function prepareLandmarkModel(db: ApiDb): Promise<{downloaded: boolean}> {
  const needed = !hasDownloadedLandmarkModel(db)
  await loadLandmarkModel(db)
  return {downloaded: needed}
}

export {
  alignFaceRgb112,
  hasDownloadedLandmarkModel,
  loadLandmarkModel,
  prepareLandmarkModel,
}
