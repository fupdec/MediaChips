import type { ApiDb } from '../types/db'
import {projectPath} from '../../shared/projectRoot'
import type { FaceBox, FaceLandmark5 } from '../types/faceDetector'
import fs from 'fs'
import https from 'https'
import http from 'http'
import path from 'path'
import { Jimp } from 'jimp'

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

type OrtModule = typeof import('onnxruntime-node')
type OrtSession = import('onnxruntime-node').InferenceSession
type JimpImage = Awaited<ReturnType<typeof Jimp.read>>

type Point2 = {x: number; y: number}
type Affine2x3 = [[number, number, number], [number, number, number]]

let ortModule: OrtModule | null = null
let landmarkSession: OrtSession | null = null
let landmarkLoading: Promise<OrtSession> | null = null

function getOrt(): OrtModule {
  if (!ortModule) ortModule = require('onnxruntime-node') as OrtModule
  return ortModule
}

function getLandmarkCacheDir(db: ApiDb) {
  const base = db?.path_databases || process.app_folder || projectPath('app_storage')
  return path.join(base, 'models', LANDMARK_MODEL_ID)
}

function getLandmarkModelPath(db: ApiDb) {
  const cached = path.join(getLandmarkCacheDir(db), LANDMARK_MODEL_FILENAME)
  return fs.existsSync(cached) ? cached : null
}

function hasDownloadedLandmarkModel(db: ApiDb) {
  return Boolean(getLandmarkModelPath(db))
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
        reject(new Error(`Failed to download face landmark model (HTTP ${response.statusCode})`))
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

async function ensureLandmarkModelFile(db: ApiDb): Promise<{path: string; downloaded: boolean}> {
  const existing = getLandmarkModelPath(db)
  if (existing) return {path: existing, downloaded: false}
  const cacheDir = getLandmarkCacheDir(db)
  fs.mkdirSync(cacheDir, {recursive: true})
  const destination = path.join(cacheDir, LANDMARK_MODEL_FILENAME)
  await downloadFile(LANDMARK_MODEL_URL, destination)
  return {path: destination, downloaded: true}
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

function samplePixel(image: JimpImage, x: number, y: number): [number, number, number] {
  const ix = Math.max(0, Math.min(image.width - 1, Math.floor(x)))
  const iy = Math.max(0, Math.min(image.height - 1, Math.floor(y)))
  const idx = (iy * image.width + ix) * 4
  const {data} = image.bitmap
  return [data[idx], data[idx + 1], data[idx + 2]]
}

function sampleBilinear(image: JimpImage, x: number, y: number): [number, number, number] {
  if (x < 0 || y < 0 || x >= image.width - 1 || y >= image.height - 1) {
    return samplePixel(image, x, y)
  }
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = x0 + 1
  const y1 = y0 + 1
  const dx = x - x0
  const dy = y - y0
  const {data} = image.bitmap
  const i00 = (y0 * image.width + x0) * 4
  const i01 = (y0 * image.width + x1) * 4
  const i10 = (y1 * image.width + x0) * 4
  const i11 = (y1 * image.width + x1) * 4
  const out: [number, number, number] = [0, 0, 0]
  for (let c = 0; c < 3; c++) {
    const v00 = data[i00 + c]
    const v01 = data[i01 + c]
    const v10 = data[i10 + c]
    const v11 = data[i11 + c]
    out[c] = (
      v00 * (1 - dx) * (1 - dy)
      + v01 * dx * (1 - dy)
      + v10 * (1 - dx) * dy
      + v11 * dx * dy
    )
  }
  return out
}

/** Similarity transform used by InsightFace landmark preprocess (rotation=0). */
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
): Uint8Array {
  const inv = invertAffine(M)
  const out = new Uint8Array(outW * outH * 3)
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const src = applyAffine(inv, x + 0.5, y + 0.5)
      const [r, g, b] = sampleBilinear(image, src.x, src.y)
      const idx = (y * outW + x) * 3
      out[idx] = r
      out[idx + 1] = g
      out[idx + 2] = b
    }
  }
  return out
}

/**
 * Least-squares similarity (scale+rotate+translate):
 * x' = a*x - b*y + tx
 * y' = b*x + a*y + ty
 */
function estimateSimilarity(src: Point2[], dst: Point2[]): Affine2x3 | null {
  const n = Math.min(src.length, dst.length)
  if (n < 2) return null

  const AtA = new Float64Array(16)
  const Atb = new Float64Array(4)
  for (let i = 0; i < n; i++) {
    const sx = src[i].x
    const sy = src[i].y
    const dx = dst[i].x
    const dy = dst[i].y
    const rows: Array<[number, number, number, number, number]> = [
      [sx, -sy, 1, 0, dx],
      [sy, sx, 0, 1, dy],
    ]
    for (const [r0, r1, r2, r3, rhs] of rows) {
      const row = [r0, r1, r2, r3]
      for (let rowIdx = 0; rowIdx < 4; rowIdx++) {
        Atb[rowIdx] += row[rowIdx] * rhs
        for (let colIdx = 0; colIdx < 4; colIdx++) {
          AtA[rowIdx * 4 + colIdx] += row[rowIdx] * row[colIdx]
        }
      }
    }
  }

  const sol = solveLinear4(AtA, Atb)
  if (!sol) return estimateSimilarityFromEyes(src, dst)
  const [a, b, tx, ty] = sol
  if (!Number.isFinite(a) || !Number.isFinite(b)) return estimateSimilarityFromEyes(src, dst)
  return [
    [a, -b, tx],
    [b, a, ty],
  ]
}

function solveLinear4(A: Float64Array, b: Float64Array): Float64Array | null {
  const m = new Float64Array(20) // 4x5 augmented
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) m[r * 5 + c] = A[r * 4 + c]
    m[r * 5 + 4] = b[r]
  }

  for (let col = 0; col < 4; col++) {
    let pivot = col
    for (let row = col + 1; row < 4; row++) {
      if (Math.abs(m[row * 5 + col]) > Math.abs(m[pivot * 5 + col])) pivot = row
    }
    if (Math.abs(m[pivot * 5 + col]) < 1e-12) return null
    if (pivot !== col) {
      for (let c = 0; c < 5; c++) {
        const tmp = m[col * 5 + c]
        m[col * 5 + c] = m[pivot * 5 + c]
        m[pivot * 5 + c] = tmp
      }
    }
    const diag = m[col * 5 + col]
    for (let c = col; c < 5; c++) m[col * 5 + c] /= diag
    for (let row = 0; row < 4; row++) {
      if (row === col) continue
      const factor = m[row * 5 + col]
      for (let c = col; c < 5; c++) m[row * 5 + c] -= factor * m[col * 5 + c]
    }
  }

  return new Float64Array([m[4], m[9], m[14], m[19]])
}

/** Fallback similarity from eyes only when Umeyama is unstable. */
function estimateSimilarityFromEyes(src: Point2[], dst: Point2[]): Affine2x3 | null {
  if (src.length < 2 || dst.length < 2) return null
  const sdx = src[1].x - src[0].x
  const sdy = src[1].y - src[0].y
  const ddx = dst[1].x - dst[0].x
  const ddy = dst[1].y - dst[0].y
  const srcLen = Math.hypot(sdx, sdy)
  const dstLen = Math.hypot(ddx, ddy)
  if (srcLen < 1e-6 || dstLen < 1e-6) return null
  const scale = dstLen / srcLen
  const angle = Math.atan2(ddy, ddx) - Math.atan2(sdy, sdx)
  const cos = Math.cos(angle) * scale
  const sin = Math.sin(angle) * scale
  const tx = dst[0].x - (cos * src[0].x - sin * src[0].y)
  const ty = dst[0].y - (sin * src[0].x + cos * src[0].y)
  return [
    [cos, -sin, tx],
    [sin, cos, ty],
  ]
}

function landmarks106To5(points: Point2[]): Point2[] {
  const avg = (indexes: number[]): Point2 => {
    let x = 0
    let y = 0
    for (const index of indexes) {
      x += points[index].x
      y += points[index].y
    }
    return {x: x / indexes.length, y: y / indexes.length}
  }
  // Common InsightFace 106 → 5 mapping used across community ports.
  return [
    avg([33, 35, 40, 39]), // left eye
    avg([87, 89, 94, 93]), // right eye
    points[86], // nose tip
    points[52], // left mouth
    points[61], // right mouth
  ]
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
  LANDMARK_MODEL_ID,
  alignFaceRgb112,
  hasDownloadedLandmarkModel,
  loadLandmarkModel,
  prepareLandmarkModel,
}
