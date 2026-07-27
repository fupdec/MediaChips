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
import { resolveExistingPath } from './contentHash'

const FACE_MODEL_ID = 'ultraface-rfb-320'
const FACE_MODEL_FILENAME = 'version-RFB-320.onnx'
const FACE_MODEL_URL = 'https://github.com/onnx/models/raw/main/validated/vision/body_analysis/ultraface/models/version-RFB-320.onnx'
const INPUT_WIDTH = 320
const INPUT_HEIGHT = 240
const DEFAULT_MIN_SCORE = 0.7
const DEFAULT_IOU = 0.3
const DEFAULT_MAX_FACES = 20
const CROP_PADDING = 0.2

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

function getRelativeCropPath(mediaId: number | string, filename: string) {
  return path.join('media/videos/faces', String(mediaId), filename)
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
  const safeCount = Math.max(1, Math.min(Number(count || 6), 12))
  const ratios = safeCount === 1
    ? [0.5]
    : Array.from({length: safeCount}, (_, index) => 0.12 + (0.76 * (index / (safeCount - 1))))

  return ratios.map((ratio) => formatTimestamp(duration * ratio))
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
  const {tensor, width, height} = await imageToInputTensor(framePath)
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
    if (boxWidth < 8 || boxHeight < 8) continue

    candidates.push({
      score,
      box: {
        x: xMin,
        y: yMin,
        width: boxWidth,
        height: boxHeight,
      },
    })
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
  const left = Math.max(0, Math.floor(box.x - padX))
  const top = Math.max(0, Math.floor(box.y - padY))
  const right = Math.min(sourceImage.width, Math.ceil(box.x + box.width + padX))
  const bottom = Math.min(sourceImage.height, Math.ceil(box.y + box.height + padY))
  const width = Math.max(1, right - left)
  const height = Math.max(1, bottom - top)
  const crop = sourceImage.clone().crop({x: left, y: top, w: width, h: height})
  const buffer = await crop.getBuffer('image/jpeg', {quality: 90})
  await fs.promises.writeFile(outputPath, buffer)
}

async function extractFramesForMedia(
  item: FaceDetectorMediaItem,
  options: FaceDetectorOptions = {},
) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediachips-faces-'))
  const frames: Array<{framePath: string; timestamp: string}> = []
  const frameWidth = Number(options.frameWidth || 640)
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
    const extracted = await extractFramesForMedia(item, options)
    tmpDir = extracted.tmpDir

    if (!extracted.frames.length) {
      return {mediaId, mediaPath, frames: 0, faces: []}
    }

    if (persist && mediaId != null && options.force) {
      removeExistingFaceAssets(db, mediaId)
    }

    const faces: FaceDetection[] = []
    let cropIndex = 0
    const facesDir = persist && mediaId != null && db.path
      ? getFacesDir(db.path, mediaId)
      : null
    if (facesDir) ensureDir(facesDir)

    for (const frame of extracted.frames) {
      const detections = await detectFacesInFrame(model, frame.framePath, options)
      if (!detections.length) continue

      const sourceImage = await Jimp.read(frame.framePath)
      for (const detection of detections) {
        let cropPath: string | null = null
        let cropRelativePath: string | null = null

        if (facesDir && mediaId != null) {
          const filename = `face_${String(cropIndex).padStart(3, '0')}.jpg`
          cropRelativePath = getRelativeCropPath(mediaId, filename)
          cropPath = path.join(facesDir, filename)
          await saveFaceCrop(sourceImage, detection.box, cropPath)
          cropIndex += 1
        }

        faces.push({
          score: detection.score,
          box: detection.box,
          timestamp: frame.timestamp,
          cropPath,
          cropRelativePath,
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
        cropPath: face.cropRelativePath,
      })))
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
  }: FaceDetectorOptions & {
    shouldStop?: () => boolean
    mediaIds?: Array<number | string>
    paths?: string[]
  } = {},
): AsyncGenerator<FaceDetectionProgressEvent> {
  const mediaRepo = createMediaRepository(db.drizzle)
  const videoTypeId = await getVideoMediaTypeId(db)

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
      framesPerVideo,
      minScore,
      persist: true,
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
  detectMedia,
  getFaceDetectionStatus,
  getStatus,
  hasDownloadedModel,
  iterateFaceDetection,
  loadModel,
}
