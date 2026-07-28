import type { ApiDb } from '../types/db'
import type { ModelStatus } from '../types/mlModels'
import type {
  FaceBox,
  FaceDetection,
  FaceDetectionGenerationStatus,
  FaceDetectionProgressEvent,
  FaceDetectorMediaItem,
  FaceDetectorMediaResult,
  FaceDetectorOptions,
} from '../types/faceDetector'
import fs from 'fs'
import https from 'https'
import http from 'http'
import os from 'os'
import path from 'path'
import { Jimp } from 'jimp'
import { extractVideoFrame, ffprobe } from '../utils/ffmpeg'
import { createFacesRepository } from '../db/repositories/faces'
import { createMediaRepository } from '../db/repositories/media'
import { createMediaTypesRepository } from '../db/repositories/mediaTypes'
import { createSettingsRepository } from '../db/repositories/settings'
import { resolveExistingPath } from './contentHash'

const FACE_MODEL_ID = 'ultraface-rfb-320'
const FACE_MODEL_FILENAME = 'version-RFB-320.onnx'
const FACE_MODEL_URL = 'https://github.com/onnx/models/raw/main/validated/vision/body_analysis/ultraface/models/version-RFB-320.onnx'
const INPUT_WIDTH = 320
const INPUT_HEIGHT = 240
const DEFAULT_MIN_SCORE = 0.9
const DEFAULT_IOU = 0.3
const DEFAULT_MAX_FACES = 20
const CROP_PADDING = 0.2
/** Extract video frames wide enough that face crops stay usable for recognition. */
const DEFAULT_FRAME_WIDTH = 1280
/** Ignore tiny boxes — usually body/skin false positives on low-res frames. */
const MIN_FACE_SIDE_PX = 80
const MIN_FACE_SIDE_RATIO = 0.08
const MAX_FACE_ASPECT = 1.7

export interface FaceDetectSettings {
  minScore: number
  framesPerVideo: number
}

function getFaceDetectSettings(db: ApiDb): FaceDetectSettings {
  const rows = createSettingsRepository(db.drizzle).findByOptions([
    'faceDetect.minScore',
    'faceDetect.framesPerVideo',
  ])
  const map = new Map(rows.map((row) => [String(row.option), row.value]))
  const minScoreRaw = Number(map.get('faceDetect.minScore') ?? DEFAULT_MIN_SCORE)
  const framesRaw = Number(map.get('faceDetect.framesPerVideo') ?? 6)
  return {
    minScore: Number.isFinite(minScoreRaw)
      ? Math.min(Math.max(minScoreRaw, 0.5), 0.98)
      : DEFAULT_MIN_SCORE,
    framesPerVideo: Number.isFinite(framesRaw)
      ? Math.min(Math.max(Math.round(framesRaw), 1), 99)
      : 6,
  }
}

function qualityGatesForScore(minScore: number) {
  // Loose (~0.5) → almost no skin/area gates; strict (~0.9+) → current aggressive gates.
  const t = Math.min(1, Math.max(0, (minScore - 0.55) / 0.4))
  return {
    maxSkinRatio: 0.95 - (t * 0.17),
    minUpperDarkRatio: 0.02 + (t * 0.04),
    maxAreaRatio: 0.5 - (t * 0.22),
    minLumaStd: 12 + (t * 4),
    applySkinFilter: minScore >= 0.65,
  }
}

type OrtModule = typeof import('onnxruntime-node')
type OrtSession = import('onnxruntime-node').InferenceSession
type OrtTensor = import('onnxruntime-node').Tensor

let ortModule: OrtModule | null = null
let session: OrtSession | null = null
let loadingPromise: Promise<OrtSession> | null = null
let lastError: Error | null = null

function getOrt(): OrtModule {
  if (!ortModule) {
    ortModule = require('onnxruntime-node') as OrtModule
  }
  return ortModule
}

function getWritableModelCacheDir(db: ApiDb) {
  const base = db?.path_databases || process.app_folder || path.join(__dirname, '../../app_storage')
  return path.join(base, 'models', FACE_MODEL_ID)
}

function getBundledModelPath() {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'models', FACE_MODEL_ID, FACE_MODEL_FILENAME) : null,
    path.join(__dirname, '..', '..', 'models', FACE_MODEL_ID, FACE_MODEL_FILENAME),
  ].filter(Boolean) as string[]

  return candidates.find((candidate) => fs.existsSync(candidate)) || null
}

function getModelPath(db: ApiDb) {
  const cached = path.join(getWritableModelCacheDir(db), FACE_MODEL_FILENAME)
  if (fs.existsSync(cached)) return cached
  return getBundledModelPath()
}

function hasDownloadedModel(db: ApiDb) {
  return Boolean(getModelPath(db))
}

function downloadFile(url: string, destination: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const request = client.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        downloadFile(response.headers.location, destination).then(resolve, reject)
        return
      }

      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`Failed to download face model (HTTP ${response.statusCode})`))
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

async function ensureModelFile(db: ApiDb): Promise<string> {
  const existing = getModelPath(db)
  if (existing) return existing

  const cacheDir = getWritableModelCacheDir(db)
  fs.mkdirSync(cacheDir, {recursive: true})
  const destination = path.join(cacheDir, FACE_MODEL_FILENAME)
  await downloadFile(FACE_MODEL_URL, destination)
  return destination
}

async function loadModel(db: ApiDb): Promise<OrtSession> {
  if (session) return session
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    try {
      const modelPath = await ensureModelFile(db)
      const ort = getOrt()
      session = await ort.InferenceSession.create(modelPath)
      lastError = null
      return session
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error))
      throw lastError
    } finally {
      loadingPromise = null
    }
  })()

  return loadingPromise
}

function getStatus(db: ApiDb, enabled: boolean = true): ModelStatus {
  if (!enabled) return {status: 'disabled', model: FACE_MODEL_ID}
  if (session) return {status: 'loaded', model: FACE_MODEL_ID, path: getWritableModelCacheDir(db)}
  if (loadingPromise) return {status: 'loading', model: FACE_MODEL_ID, path: getWritableModelCacheDir(db)}
  if (lastError) {
    return {
      status: 'error',
      model: FACE_MODEL_ID,
      path: getWritableModelCacheDir(db),
      message: lastError.message,
    }
  }

  return {
    status: hasDownloadedModel(db) ? 'downloaded' : 'not_downloaded',
    model: FACE_MODEL_ID,
    path: getWritableModelCacheDir(db),
  }
}

function getFacesDir(dbPath: string, mediaId: number | string) {
  return path.join(dbPath, 'media/videos/faces', String(mediaId))
}

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, {recursive: true})
  }
}

function cleanupDir(dirPath: string | null) {
  if (dirPath && fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, {recursive: true, force: true})
  }
}

function formatTimestamp(seconds: number) {
  return new Date(Math.floor(seconds) * 1000).toISOString().substr(11, 8)
}

function getFrameTimestamps(duration: number, count: number) {
  const safeCount = Math.max(1, Math.min(Number(count || 6), 99))
  const ratios = safeCount === 1
    ? [0.5]
    : Array.from({length: safeCount}, (_, index) => 0.12 + (0.76 * (index / (safeCount - 1))))

  return ratios.map((ratio) => formatTimestamp(duration * ratio))
}

function resolveStoredCropPath(dbPath: string, cropPath: string | null | undefined) {
  if (!cropPath) return null
  if (path.isAbsolute(cropPath)) return fs.existsSync(cropPath) ? cropPath : null
  const absolute = path.join(dbPath, cropPath)
  return fs.existsSync(absolute) ? absolute : null
}

/** Remove all on-disk face crops (library auto-scan does not keep them). */
function purgeAllFaceCrops(db: ApiDb) {
  if (!db.path) return
  const root = path.join(String(db.path), 'media/videos/faces')
  cleanupDir(root)
  createFacesRepository(db.drizzle).clearAllCropPaths()
}

/** Keep crops only for the media currently under manual review. */
function purgeOtherMediaFaceCrops(db: ApiDb, keepMediaId: number) {
  if (!db.path) return
  const root = path.join(String(db.path), 'media/videos/faces')
  if (fs.existsSync(root)) {
    for (const entry of fs.readdirSync(root)) {
      if (entry === String(keepMediaId)) continue
      cleanupDir(path.join(root, entry))
    }
  }
  createFacesRepository(db.drizzle).clearCropPathsExceptMediaId(keepMediaId)
}

/**
 * Rebuild face crop JPEGs for review UI from stored boxes + timestamps.
 * Used when faces were detected without persisting crops (auto-scan).
 */
async function ensureFaceCropsForMedia(db: ApiDb, mediaId: number): Promise<number> {
  if (!db.path || !Number.isFinite(mediaId) || mediaId <= 0) return 0

  const facesRepo = createFacesRepository(db.drizzle)
  const mediaRepo = createMediaRepository(db.drizzle)
  const faceRows = facesRepo.findByMediaId(mediaId)
  if (!faceRows.length) {
    purgeOtherMediaFaceCrops(db, mediaId)
    return 0
  }

  const missing = faceRows.filter((face) => !resolveStoredCropPath(String(db.path), face.cropPath))
  purgeOtherMediaFaceCrops(db, mediaId)
  if (!missing.length) return 0

  const media = mediaRepo.findById(mediaId)
  if (!media?.path) return 0
  const resolvedPath = (await resolveExistingPath(String(media.path))) || media.path
  if (!resolvedPath || !fs.existsSync(String(resolvedPath))) return 0

  const facesDir = getFacesDir(String(db.path), mediaId)
  ensureDir(facesDir)

  const byTimestamp = new Map<string, typeof missing>()
  for (const face of missing) {
    const key = face.timestamp || '00:00:00'
    const list = byTimestamp.get(key) || []
    list.push(face)
    byTimestamp.set(key, list)
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediachips-face-crops-'))
  let created = 0
  try {
    let frameIndex = 0
    for (const [timestamp, facesAtTs] of byTimestamp) {
      const framePath = path.join(tmpDir, `frame_${frameIndex}.jpg`)
      frameIndex += 1
      try {
        await extractVideoFrame({
          input: String(resolvedPath),
          output: framePath,
          timestamp,
          vf: `scale=${DEFAULT_FRAME_WIDTH}:-1`,
        })
      } catch {
        continue
      }

      let sourceImage: Awaited<ReturnType<typeof Jimp.read>>
      try {
        sourceImage = await Jimp.read(framePath)
      } catch {
        continue
      }

      for (const face of facesAtTs) {
        const filename = `face_${String(face.id).padStart(3, '0')}.jpg`
        const absoluteCrop = path.join(facesDir, filename)
        const relativeCrop = path.join('media/videos/faces', String(mediaId), filename)
        try {
          await saveFaceCrop(sourceImage, {
            x: Number(face.x || 0),
            y: Number(face.y || 0),
            width: Number(face.width || 0),
            height: Number(face.height || 0),
          }, absoluteCrop)
          facesRepo.updateCropPath(Number(face.id), relativeCrop)
          created += 1
        } catch {
          // Skip broken crops; review UI can still show without them.
        }
      }
    }
  } finally {
    cleanupDir(tmpDir)
  }

  return created
}

async function getVideoDuration(filePath: string) {
  const info = await ffprobe(filePath)
  const duration = Number(info?.format?.duration || 0)
  if (!duration) throw new Error('Video duration is unavailable.')
  return duration
}

function iou(a: FaceBox, b: FaceBox) {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const union = a.width * a.height + b.width * b.height - inter
  return union > 0 ? inter / union : 0
}

function hardNms(
  detections: Array<{score: number; box: FaceBox}>,
  iouThreshold: number,
  topK: number,
) {
  const sorted = [...detections].sort((a, b) => b.score - a.score)
  const kept: Array<{score: number; box: FaceBox}> = []

  for (const candidate of sorted) {
    if (kept.some((existing) => iou(existing.box, candidate.box) > iouThreshold)) continue
    kept.push(candidate)
    if (kept.length >= topK) break
  }

  return kept
}

/** Reject flat skin / body blobs that UltraFace often scores as faces. */
function isLikelySkinPixel(r: number, g: number, b: number) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  // Broad RGB skin heuristic — catches body FPs without needing HSV.
  return (
    r > 60
    && g > 30
    && b > 15
    && r >= g
    && r > b
    && (r - g) >= 8
    && (max - min) >= 12
  )
}

function boxLooksLikeFace(
  image: Awaited<ReturnType<typeof Jimp.read>>,
  box: FaceBox,
  minScore: number = DEFAULT_MIN_SCORE,
): boolean {
  const gates = qualityGatesForScore(minScore)
  const left = Math.max(0, Math.floor(box.x))
  const top = Math.max(0, Math.floor(box.y))
  const right = Math.min(image.width, Math.ceil(box.x + box.width))
  const bottom = Math.min(image.height, Math.ceil(box.y + box.height))
  const width = right - left
  const height = bottom - top
  if (width < 8 || height < 8) return false

  const stepX = Math.max(1, Math.floor(width / 28))
  const stepY = Math.max(1, Math.floor(height / 28))
  const samples: number[] = []
  let skinCount = 0
  let upperDark = 0
  let upperCount = 0
  let lowerCount = 0
  let upperSum = 0
  let lowerSum = 0
  const upperCut = top + height * 0.4
  const midY = top + height * 0.5

  for (let y = top; y < bottom; y += stepY) {
    for (let x = left; x < right; x += stepX) {
      const rgba = image.getPixelColor(x, y) >>> 0
      const r = (rgba >> 24) & 0xff
      const g = (rgba >> 16) & 0xff
      const b = (rgba >> 8) & 0xff
      const luma = 0.299 * r + 0.587 * g + 0.114 * b
      samples.push(luma)
      if (isLikelySkinPixel(r, g, b)) skinCount += 1
      if (y < midY) {
        upperSum += luma
        upperCount += 1
      } else {
        lowerSum += luma
        lowerCount += 1
      }
      if (y < upperCut && luma < 90) upperDark += 1
    }
  }

  const count = samples.length
  if (count < 16) return false

  let sum = 0
  for (const luma of samples) sum += luma
  const mean = sum / count
  let sumSq = 0
  for (const luma of samples) sumSq += (luma - mean) * (luma - mean)
  const std = Math.sqrt(sumSq / count)
  if (std < gates.minLumaStd) return false

  if (!gates.applySkinFilter) return true

  const skinRatio = skinCount / count
  const upperSamples = Math.max(1, Math.ceil(count * 0.4))
  const upperDarkRatio = upperDark / upperSamples

  if (skinRatio >= gates.maxSkinRatio && upperDarkRatio < gates.minUpperDarkRatio * 2) {
    return false
  }
  if (skinRatio >= 0.92) return false
  if (upperDarkRatio < gates.minUpperDarkRatio && skinRatio >= 0.55) return false

  if (upperCount > 0 && lowerCount > 0) {
    const upperMean = upperSum / upperCount
    const lowerMean = lowerSum / lowerCount
    const verticalGap = Math.abs(upperMean - lowerMean)
    if (verticalGap < 5 && std < 24 && skinRatio >= 0.5) return false
  }

  return true
}

async function imageToInputTensor(framePath: string): Promise<{
  tensor: OrtTensor
  width: number
  height: number
  image: Awaited<ReturnType<typeof Jimp.read>>
}> {
  const ort = getOrt()
  const image = await Jimp.read(framePath)
  const width = image.width
  const height = image.height
  const resized = image.clone().resize({w: INPUT_WIDTH, h: INPUT_HEIGHT})
  const {data} = resized.bitmap
  const floatData = new Float32Array(1 * 3 * INPUT_HEIGHT * INPUT_WIDTH)

  for (let y = 0; y < INPUT_HEIGHT; y++) {
    for (let x = 0; x < INPUT_WIDTH; x++) {
      const idx = (y * INPUT_WIDTH + x) * 4
      const offset = y * INPUT_WIDTH + x
      floatData[offset] = (data[idx] - 127) / 128
      floatData[INPUT_WIDTH * INPUT_HEIGHT + offset] = (data[idx + 1] - 127) / 128
      floatData[2 * INPUT_WIDTH * INPUT_HEIGHT + offset] = (data[idx + 2] - 127) / 128
    }
  }

  return {
    tensor: new ort.Tensor('float32', floatData, [1, 3, INPUT_HEIGHT, INPUT_WIDTH]),
    width,
    height,
    image,
  }
}

async function detectFacesInFrame(
  model: OrtSession,
  framePath: string,
  options: FaceDetectorOptions = {},
): Promise<Array<{score: number; box: FaceBox}>> {
  const minScore = Number(options.minScore ?? DEFAULT_MIN_SCORE)
  const iouThreshold = Number(options.iouThreshold ?? DEFAULT_IOU)
  const maxFaces = Number(options.maxFacesPerFrame ?? DEFAULT_MAX_FACES)
  const {tensor, width, height, image} = await imageToInputTensor(framePath)
  const inputName = model.inputNames[0] || 'input'
  const outputs = await model.run({[inputName]: tensor})
  const scoresTensor = outputs.scores || outputs[model.outputNames.find((name) => /score/i.test(name)) || '']
  const boxesTensor = outputs.boxes || outputs[model.outputNames.find((name) => /box/i.test(name)) || '']

  if (!scoresTensor || !boxesTensor) {
    throw new Error('Face model returned unexpected outputs.')
  }

  const scores = scoresTensor.data as Float32Array
  const boxes = boxesTensor.data as Float32Array
  const num = boxesTensor.dims[1] || Math.floor(boxes.length / 4)
  const frameArea = Math.max(1, width * height)
  const gates = qualityGatesForScore(minScore)
  const candidates: Array<{score: number; box: FaceBox}> = []

  for (let i = 0; i < num; i++) {
    const score = scores[i * 2 + 1]
    if (!(score >= minScore)) continue

    const xMin = Math.max(0, Math.min(1, boxes[i * 4])) * width
    const yMin = Math.max(0, Math.min(1, boxes[i * 4 + 1])) * height
    const xMax = Math.max(0, Math.min(1, boxes[i * 4 + 2])) * width
    const yMax = Math.max(0, Math.min(1, boxes[i * 4 + 3])) * height
    const boxWidth = xMax - xMin
    const boxHeight = yMax - yMin
    const minSide = Math.min(boxWidth, boxHeight)
    const maxSide = Math.max(boxWidth, boxHeight)
    const frameMin = Math.min(width, height)
    if (minSide < MIN_FACE_SIDE_PX && minSide < frameMin * MIN_FACE_SIDE_RATIO) continue
    if (maxSide / Math.max(minSide, 1) > MAX_FACE_ASPECT) continue
    if ((boxWidth * boxHeight) / frameArea > gates.maxAreaRatio) continue

    const box = {
      x: xMin,
      y: yMin,
      width: boxWidth,
      height: boxHeight,
    }
    if (!boxLooksLikeFace(image, box, minScore)) continue

    candidates.push({score, box})
  }

  return hardNms(candidates, iouThreshold, maxFaces)
}

async function saveFaceCrop(
  sourceImage: Awaited<ReturnType<typeof Jimp.read>>,
  box: FaceBox,
  outputPath: string,
) {
  const padX = box.width * CROP_PADDING
  const padY = box.height * CROP_PADDING
  let left = box.x - padX
  let top = box.y - padY
  let right = box.x + box.width + padX
  let bottom = box.y + box.height + padY

  // Expand to a square around the face so resize does not distort/crop features.
  const width = right - left
  const height = bottom - top
  const side = Math.max(width, height)
  const cx = (left + right) / 2
  const cy = (top + bottom) / 2
  left = cx - side / 2
  top = cy - side / 2
  right = cx + side / 2
  bottom = cy + side / 2

  // Keep as much of the square as fits in the frame (shift inward near edges).
  if (left < 0) {
    right -= left
    left = 0
  }
  if (top < 0) {
    bottom -= top
    top = 0
  }
  if (right > sourceImage.width) {
    left -= right - sourceImage.width
    right = sourceImage.width
  }
  if (bottom > sourceImage.height) {
    top -= bottom - sourceImage.height
    bottom = sourceImage.height
  }
  left = Math.max(0, Math.floor(left))
  top = Math.max(0, Math.floor(top))
  right = Math.min(sourceImage.width, Math.ceil(right))
  bottom = Math.min(sourceImage.height, Math.ceil(bottom))

  const cropW = Math.max(1, right - left)
  const cropH = Math.max(1, bottom - top)
  const crop = sourceImage.clone().crop({x: left, y: top, w: cropW, h: cropH})
  const buffer = await crop.getBuffer('image/jpeg', {quality: 90})
  await fs.promises.writeFile(outputPath, buffer)
}

async function extractFramesForMedia(
  item: FaceDetectorMediaItem,
  options: FaceDetectorOptions = {},
) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediachips-faces-'))
  const frames: Array<{framePath: string; timestamp: string}> = []
  const frameWidth = Number(options.frameWidth || DEFAULT_FRAME_WIDTH)
  const framesPerVideo = Number(options.framesPerVideo || 6)

  if (!item?.path || !fs.existsSync(String(item.path))) {
    return {tmpDir, frames}
  }

  let duration: number
  try {
    duration = await getVideoDuration(String(item.path))
  } catch {
    return {tmpDir, frames}
  }

  const timestamps = getFrameTimestamps(duration, framesPerVideo)
  for (let index = 0; index < timestamps.length; index++) {
    const output = path.join(tmpDir, `${item.id || 'media'}_${index}.jpg`)
    try {
      await extractVideoFrame({
        input: String(item.path),
        output,
        timestamp: timestamps[index],
        vf: `scale=${frameWidth}:-1`,
      })
      frames.push({framePath: output, timestamp: timestamps[index]})
    } catch {
      // Skip broken frames.
    }
  }

  return {tmpDir, frames}
}

function removeExistingFaceAssets(db: ApiDb, mediaId: number) {
  const facesRepo = createFacesRepository(db.drizzle)
  const existing = facesRepo.findByMediaId(mediaId)
  for (const face of existing) {
    if (!face.cropPath) continue
    const absolute = path.isAbsolute(face.cropPath)
      ? face.cropPath
      : path.join(String(db.path), face.cropPath)
    try {
      if (fs.existsSync(absolute)) fs.unlinkSync(absolute)
    } catch {
      // Ignore cleanup errors.
    }
  }
  facesRepo.deleteByMediaId(mediaId)

  const facesDir = getFacesDir(String(db.path), mediaId)
  cleanupDir(facesDir)
}

async function detectMedia(
  db: ApiDb,
  item: FaceDetectorMediaItem,
  options: FaceDetectorOptions = {},
): Promise<FaceDetectorMediaResult> {
  const mediaId = item?.id != null ? Number(item.id) : null
  const mediaPath = item?.path ? String(item.path) : null
  const persist = options.persist !== false
  // Crops are for manual review visuals only — auto-scan stores embeddings, not JPEGs.
  const persistCrops = Boolean(options.persistCrops)
  const detectSettings = getFaceDetectSettings(db)
  const framesRaw = Number(
    options.framesPerVideo != null ? options.framesPerVideo : detectSettings.framesPerVideo,
  )
  const scoreRaw = Number(
    options.minScore != null ? options.minScore : detectSettings.minScore,
  )
  const resolvedOptions: FaceDetectorOptions = {
    ...options,
    persistCrops,
    framesPerVideo: Number.isFinite(framesRaw)
      ? Math.min(99, Math.max(1, Math.round(framesRaw)))
      : detectSettings.framesPerVideo,
    minScore: Number.isFinite(scoreRaw)
      ? Math.min(0.98, Math.max(0.5, scoreRaw))
      : detectSettings.minScore,
  }

  if (!mediaPath || !fs.existsSync(mediaPath)) {
    return {
      mediaId,
      mediaPath,
      frames: 0,
      faces: [],
      missing: true,
    }
  }

  if (mediaId != null && !options.force) {
    const existing = createFacesRepository(db.drizzle).findByMediaId(mediaId)
    if (existing.length) {
      return {
        mediaId,
        mediaPath,
        frames: 0,
        faces: existing.map((face) => ({
          score: Number(face.score || 0),
          box: {
            x: Number(face.x || 0),
            y: Number(face.y || 0),
            width: Number(face.width || 0),
            height: Number(face.height || 0),
          },
          timestamp: face.timestamp,
          cropPath: face.cropPath
            ? (path.isAbsolute(face.cropPath) ? face.cropPath : path.join(String(db.path), face.cropPath))
            : null,
          cropRelativePath: face.cropPath,
        })),
        skipped: true,
      }
    }
  }

  let tmpDir: string | null = null
  try {
    const model = await loadModel(db)
    const extracted = await extractFramesForMedia(item, resolvedOptions)
    tmpDir = extracted.tmpDir

    if (!extracted.frames.length) {
      return {mediaId, mediaPath, frames: 0, faces: []}
    }

    if (persist && mediaId != null && options.force) {
      removeExistingFaceAssets(db, mediaId)
    }

    const faces: FaceDetection[] = []
    let cropIndex = 0
    let facesDir: string | null = null
    const ensureFacesDir = () => {
      if (facesDir || !(persist && persistCrops && mediaId != null && db.path)) return facesDir
      facesDir = getFacesDir(db.path, mediaId)
      ensureDir(facesDir)
      return facesDir
    }

    let embedImage: ((db: ApiDb, imagePath: string) => Promise<Float32Array>) | null = null
    let embeddingToJson: ((embedding: Float32Array) => string) | null = null
    try {
      const faceRecognition = require('./faceRecognition') as typeof import('./faceRecognition')
      await faceRecognition.loadEmbedModel(db)
      embedImage = faceRecognition.embedImage
      embeddingToJson = faceRecognition.embeddingToJson
    } catch {
      // Embedding is optional during detect; matching will skip faces without vectors.
    }

    for (const frame of extracted.frames) {
      const detections = await detectFacesInFrame(model, frame.framePath, resolvedOptions)
      if (!detections.length) continue

      const sourceImage = await Jimp.read(frame.framePath)
      for (const detection of detections) {
        let cropPath: string | null = null
        let cropRelativePath: string | null = null
        let embedding: string | null = null

        const filename = `face_${String(cropIndex).padStart(3, '0')}.jpg`
        cropIndex += 1
        const dir = ensureFacesDir()
        // Persist only for manual review; otherwise write a temp crop just for embedding.
        const absoluteCrop = dir
          ? path.join(dir, filename)
          : (tmpDir ? path.join(tmpDir, filename) : null)

        if (absoluteCrop) {
          try {
            await saveFaceCrop(sourceImage, detection.box, absoluteCrop)
            if (dir && mediaId != null) {
              cropRelativePath = path.join('media/videos/faces', String(mediaId), filename)
              cropPath = absoluteCrop
            }
          } catch {
            cropPath = null
            cropRelativePath = null
          }

          if (absoluteCrop && fs.existsSync(absoluteCrop) && embedImage && embeddingToJson) {
            try {
              const vector = await embedImage(db, absoluteCrop)
              embedding = embeddingToJson(vector)
            } catch {
              embedding = null
            }
          }
        }

        faces.push({
          score: detection.score,
          box: detection.box,
          timestamp: frame.timestamp,
          cropPath,
          cropRelativePath,
          embedding,
        })
      }
    }

    if (persist && mediaId != null && faces.length) {
      createFacesRepository(db.drizzle).bulkCreate(faces.map((face) => ({
        mediaId,
        timestamp: face.timestamp,
        score: face.score,
        x: face.box.x,
        y: face.box.y,
        width: face.box.width,
        height: face.box.height,
        cropPath: persistCrops ? face.cropRelativePath : null,
        embedding: face.embedding ?? null,
      })))

      if (persistCrops) {
        purgeOtherMediaFaceCrops(db, mediaId)
      }

      try {
        const {
          getFaceMatchSettings,
          matchMediaFaces,
        } = require('./faceRecognition') as typeof import('./faceRecognition')
        const matchSettings = getFaceMatchSettings(db)
        if (matchSettings.matchAfterDetect && matchSettings.performerMetaId) {
          await matchMediaFaces(db, mediaId, {force: Boolean(options.force), settings: matchSettings})
        }
      } catch {
        // Matching is optional and should not fail detection.
      }
    }

    return {
      mediaId,
      mediaPath,
      frames: extracted.frames.length,
      faces,
    }
  } catch (error: unknown) {
    return {
      mediaId,
      mediaPath,
      frames: 0,
      faces: [],
      failed: true,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    cleanupDir(tmpDir)
  }
}

async function getVideoMediaTypeId(db: ApiDb) {
  const mediaTypesRepo = createMediaTypesRepository(db.drizzle)
  const videoType = mediaTypesRepo.findByType('video')
  return videoType?.id || null
}

async function getFaceDetectionStatus(db: ApiDb): Promise<FaceDetectionGenerationStatus> {
  const mediaRepo = createMediaRepository(db.drizzle)
  const facesRepo = createFacesRepository(db.drizzle)
  const videoTypeId = await getVideoMediaTypeId(db)
  const total = videoTypeId ? mediaRepo.countByMediaType(videoTypeId) : 0
  const generated = facesRepo.countDistinctMediaIds()
  return {
    total,
    generated,
    pending: Math.max(total - generated, 0),
    faces: facesRepo.countAll(),
  }
}

async function* iterateFaceDetection(
  db: ApiDb,
  {
    shouldStop = () => false,
    force = false,
    mediaIds,
    paths,
    framesPerVideo,
    minScore,
    persistCrops = false,
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

  let items: FaceDetectorMediaItem[] = []
  if (Array.isArray(mediaIds) && mediaIds.length) {
    items = mediaIds
      .map((id) => mediaRepo.findById(Number(id)))
      .filter(Boolean)
      .map((row) => ({id: row!.id, path: row!.path}))
  } else if (Array.isArray(paths) && paths.length) {
    items = mediaRepo.findByPaths(paths, videoTypeId || undefined)
      .map((row) => ({id: row.id, path: row.path}))
  } else if (videoTypeId) {
    items = mediaRepo.findByMediaType(videoTypeId).map((row) => ({id: row.id, path: row.path}))
  }

  // Auto-scan never keeps crop galleries — free disk from older runs.
  if (!persistCrops) {
    purgeAllFaceCrops(db)
  }

  const total = items.length
  let processed = 0
  let created = 0
  let skipped = 0
  let missing = 0
  let failed = 0
  let faces = 0

  yield {
    type: 'progress',
    processed,
    total,
    remaining: total,
    created,
    skipped,
    missing,
    failed,
    faces,
  }

  for (const item of items) {
    if (shouldStop()) {
      yield {
        type: 'complete',
        processed,
        total,
        created,
        skipped,
        missing,
        failed,
        faces,
        stopped: true,
      }
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
    })

    processed += 1
    faces += result.faces.length

    if (result.missing) missing += 1
    else if (result.failed) failed += 1
    else if (result.skipped) skipped += 1
    else created += 1

    yield {
      type: 'progress',
      processed,
      total,
      remaining: Math.max(total - processed, 0),
      created,
      skipped,
      missing,
      failed,
      faces,
      current: result.mediaPath || undefined,
      mediaId: result.mediaId,
    }
  }

  yield {
    type: 'complete',
    processed,
    total,
    created,
    skipped,
    missing,
    failed,
    faces,
    stopped: false,
  }
}

export {
  FACE_MODEL_ID,
  detectFacesInFrame,
  detectMedia,
  ensureFaceCropsForMedia,
  getFaceDetectSettings,
  getFaceDetectionStatus,
  getStatus,
  hasDownloadedModel,
  iterateFaceDetection,
  loadModel,
  purgeAllFaceCrops,
  purgeOtherMediaFaceCrops,
  saveFaceCrop,
}
