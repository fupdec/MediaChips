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
  FaceLandmark5,
} from '../types/faceDetector'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { Jimp } from 'jimp'
import { extractVideoFrame, ffprobe } from '../utils/ffmpeg'
import { createFacesRepository } from '../db/repositories/faces'
import { createMediaRepository } from '../db/repositories/media'
import { createMediaTypesRepository } from '../db/repositories/mediaTypes'
import { createSettingsRepository } from '../db/repositories/settings'
import { resolveExistingPath } from './contentHash'
import { assessMatchability } from './matchGates'
import {
  estimateGender,
  loadGenderModel,
  normalizeGenderFilter,
  passesGenderFilter,
  prepareGenderModel,
  type FaceGenderFilter,
} from './faceGender'
import {
  getFrameTimestamps,
  hardNms,
  pickDiverseFrames,
  qualityGatesForScore,
  averageHashFromLumaValues,
  computeOversampledFrameCount,
  groupItemsByKey,
} from './faceDetectorMath'
import {
  boxLooksLikeFace,
  estimateBlurVariance,
} from './faceBoxQuality'
import {
  SCRFD_NUM_ANCHORS,
  SCRFD_STRIDES,
  getAnchorCenters,
  scoreAt,
  tensorAsRows,
  type OrtTensorLike,
} from './faceScrfdDecode'
import {
  clampFaceDetectFramesPerVideo,
  clampFaceDetectMinScore,
} from './faceSettingsParse'
import {computePaddedSquareCropRect, DEFAULT_FACE_CROP_PADDING} from './faceCropGeometry'
import {resolveAbsoluteCropPath} from './faceEnrollmentPaths'
import {packLetterboxedRgbaToNchw} from './faceTensorPrep'
import {
  ensureCachedModelFile,
  getFaceModelCacheDir,
  getOrt,
  resolveCachedModelPath,
  type OrtSession,
  type OrtTensor,
} from './faceOrtRuntime'

const FACE_MODEL_ID = 'scrfd-10g'
const FACE_MODEL_FILENAME = 'det_10g.onnx'
const FACE_MODEL_URL = 'https://huggingface.co/deepghs/insightface/resolve/main/buffalo_l/det_10g.onnx'
/** Rough size shown in UI (~buffalo_l SCRFD-10G). */
const FACE_MODEL_SIZE_MB = 16
const DET_INPUT_SIZE = 640
const DEFAULT_MIN_SCORE = 0.5
const DEFAULT_IOU = 0.4
const DEFAULT_MAX_FACES = 20
const CROP_PADDING = DEFAULT_FACE_CROP_PADDING
/** Extract video frames wide enough that face crops stay usable for recognition. */
const DEFAULT_FRAME_WIDTH = 1280
/** Ignore tiny boxes — usually body/skin false positives on low-res frames. */
const MIN_FACE_SIDE_PX = 48
const MIN_FACE_SIDE_RATIO = 0.04
const MAX_FACE_ASPECT = 1.85
const SCRFD_MEAN = 127.5
const SCRFD_STD = 128
export interface FaceDetectSettings {
  minScore: number
  framesPerVideo: number
  genderFilter: FaceGenderFilter
}

function getFaceDetectSettings(db: ApiDb): FaceDetectSettings {
  const rows = createSettingsRepository(db.drizzle).findByOptions([
    'faceDetect.minScore',
    'faceDetect.framesPerVideo',
    'faceDetect.genderFilter',
  ])
  const map = new Map(rows.map((row) => [String(row.option), row.value]))
  return {
    minScore: clampFaceDetectMinScore(map.get('faceDetect.minScore'), DEFAULT_MIN_SCORE),
    framesPerVideo: clampFaceDetectFramesPerVideo(map.get('faceDetect.framesPerVideo'), 6),
    genderFilter: normalizeGenderFilter(map.get('faceDetect.genderFilter')),
  }
}

let session: OrtSession | null = null
let loadingPromise: Promise<OrtSession> | null = null
let lastError: Error | null = null

const getWritableModelCacheDir = (db: ApiDb) => getFaceModelCacheDir(db, FACE_MODEL_ID)

const getModelPath = (db: ApiDb) =>
  resolveCachedModelPath(db, FACE_MODEL_ID, FACE_MODEL_FILENAME)

function hasDownloadedModel(db: ApiDb) {
  return Boolean(getModelPath(db))
}

async function ensureModelFile(db: ApiDb): Promise<{path: string; downloaded: boolean}> {
  return ensureCachedModelFile(db, {
    modelId: FACE_MODEL_ID,
    filename: FACE_MODEL_FILENAME,
    url: FACE_MODEL_URL,
    errorLabel: 'face model',
  })
}

async function loadModel(db: ApiDb): Promise<OrtSession> {
  if (session) return session
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    try {
      const {path: modelPath} = await ensureModelFile(db)
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

type DetectPrepEvent = {
  type: 'status'
  phase: 'downloading_detect' | 'detect_ready'
  message: string
  sizeMb?: number
}

async function* prepareDetectModel(db: ApiDb): AsyncGenerator<DetectPrepEvent> {
  const needsDownload = !hasDownloadedModel(db)
  if (needsDownload) {
    yield {
      type: 'status',
      phase: 'downloading_detect',
      message: `Downloading face detection model (~${FACE_MODEL_SIZE_MB} MB)…`,
      sizeMb: FACE_MODEL_SIZE_MB,
    }
  }
  await loadModel(db)
  if (needsDownload) {
    yield {
      type: 'status',
      phase: 'detect_ready',
      message: 'Face detection model downloaded.',
      sizeMb: FACE_MODEL_SIZE_MB,
    }
  }
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

/** Average-hash fingerprint for cheap near-duplicate frame rejection. */
async function frameFingerprint(framePath: string): Promise<string> {
  const image = await Jimp.read(framePath)
  const tiny = image.clone().resize({w: 8, h: 8}).greyscale()
  const {data, width, height} = tiny.bitmap
  const values: number[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      values.push(data[(y * width + x) * 4])
    }
  }
  return averageHashFromLumaValues(values)
}

function resolveStoredCropPath(dbPath: string, cropPath: string | null | undefined) {
  return resolveAbsoluteCropPath(dbPath, cropPath)
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
  if (!faceRows.length) return 0

  const missing = faceRows.filter((face) => !resolveStoredCropPath(String(db.path), face.cropPath))
  // Fast path: crops already on disk — do not purge/re-extract on every dialog open.
  if (!missing.length) return 0

  // Free disk before writing new review crops for this media.
  purgeOtherMediaFaceCrops(db, mediaId)

  const media = mediaRepo.findById(mediaId)
  if (!media?.path) return 0
  const resolvedPath = (await resolveExistingPath(String(media.path))) || media.path
  if (!resolvedPath || !fs.existsSync(String(resolvedPath))) return 0

  const facesDir = getFacesDir(String(db.path), mediaId)
  ensureDir(facesDir)

  const byTimestamp = groupItemsByKey(missing, (face) => face.timestamp || '00:00:00')

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediachips-face-crops-'))
  let created = 0
  try {
    const timestampEntries = [...byTimestamp.entries()]
    const frames = await Promise.all(timestampEntries.map(async ([timestamp, facesAtTs], frameIndex) => {
      const framePath = path.join(tmpDir, `frame_${frameIndex}.jpg`)
      try {
        await extractVideoFrame({
          input: String(resolvedPath),
          output: framePath,
          timestamp,
          vf: `scale=${DEFAULT_FRAME_WIDTH}:-1`,
        })
        const sourceImage = await Jimp.read(framePath)
        return {facesAtTs, sourceImage}
      } catch {
        return null
      }
    }))

    for (const frame of frames) {
      if (!frame) continue
      for (const face of frame.facesAtTs) {
        const filename = `face_${String(face.id).padStart(3, '0')}.jpg`
        const absoluteCrop = path.join(facesDir, filename)
        const relativeCrop = path.join('media/videos/faces', String(mediaId), filename)
        try {
          await saveFaceCrop(frame.sourceImage, {
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

async function imageToScrfdInput(framePath: string): Promise<{
  tensor: OrtTensor
  width: number
  height: number
  detScale: number
  image: Awaited<ReturnType<typeof Jimp.read>>
}> {
  const ort = getOrt()
  const image = await Jimp.read(framePath)
  const width = image.width
  const height = image.height

  const imRatio = height / Math.max(width, 1)
  const modelRatio = 1
  let newWidth: number
  let newHeight: number
  if (imRatio > modelRatio) {
    newHeight = DET_INPUT_SIZE
    newWidth = Math.max(1, Math.round(newHeight / imRatio))
  } else {
    newWidth = DET_INPUT_SIZE
    newHeight = Math.max(1, Math.round(newWidth * imRatio))
  }
  const detScale = newHeight / Math.max(height, 1)

  const resized = image.clone().resize({w: newWidth, h: newHeight})
  const floatData = packLetterboxedRgbaToNchw(
    resized.bitmap.data,
    newWidth,
    newHeight,
    DET_INPUT_SIZE,
    SCRFD_MEAN,
    SCRFD_STD,
  )

  return {
    tensor: new ort.Tensor('float32', floatData, [1, 3, DET_INPUT_SIZE, DET_INPUT_SIZE]),
    width,
    height,
    detScale,
    image,
  }
}

async function detectFacesInFrame(
  model: OrtSession,
  framePath: string,
  options: FaceDetectorOptions = {},
): Promise<Array<{score: number; box: FaceBox; kps: FaceLandmark5 | null}>> {
  const minScore = Number(options.minScore ?? DEFAULT_MIN_SCORE)
  const iouThreshold = Number(options.iouThreshold ?? DEFAULT_IOU)
  const maxFaces = Number(options.maxFacesPerFrame ?? DEFAULT_MAX_FACES)
  const {tensor, width, height, detScale, image} = await imageToScrfdInput(framePath)
  const inputName = model.inputNames[0] || 'input.1'
  const outputs = await model.run({[inputName]: tensor})
  const names = model.outputNames
  if (names.length < 6) {
    throw new Error(`SCRFD model returned unexpected outputs (${names.length}).`)
  }

  const fmc = 3
  const useKps = names.length >= 9
  const candidates: Array<{score: number; box: FaceBox; kps: FaceLandmark5 | null}> = []
  const frameArea = Math.max(1, width * height)
  const gates = qualityGatesForScore(minScore)

  for (let idx = 0; idx < fmc; idx++) {
    const stride = SCRFD_STRIDES[idx]
    const scoreTensor = outputs[names[idx]]
    const bboxTensor = outputs[names[idx + fmc]]
    const kpsTensor = useKps ? outputs[names[idx + fmc * 2]] : null
    if (!scoreTensor || !bboxTensor) continue

    const featH = Math.floor(DET_INPUT_SIZE / stride)
    const featW = Math.floor(DET_INPUT_SIZE / stride)
    const centers = getAnchorCenters(featH, featW, stride)
    const expected = featH * featW * SCRFD_NUM_ANCHORS

    const scores = tensorAsRows(scoreTensor as OrtTensorLike, 1)
    const bboxes = tensorAsRows(bboxTensor as OrtTensorLike, 4)
    const kpsRows = kpsTensor ? tensorAsRows(kpsTensor as OrtTensorLike, 10) : null
    const n = Math.min(expected, scores.rows, bboxes.rows, kpsRows ? kpsRows.rows : expected)

    for (let i = 0; i < n; i++) {
      const score = scoreAt(scoreTensor as OrtTensorLike, i)
      if (!(score >= minScore)) continue

      const cx = centers[i * 2]
      const cy = centers[i * 2 + 1]
      const d0 = bboxes.data[i * 4] * stride
      const d1 = bboxes.data[i * 4 + 1] * stride
      const d2 = bboxes.data[i * 4 + 2] * stride
      const d3 = bboxes.data[i * 4 + 3] * stride

      let x1 = (cx - d0) / detScale
      let y1 = (cy - d1) / detScale
      let x2 = (cx + d2) / detScale
      let y2 = (cy + d3) / detScale

      x1 = Math.max(0, Math.min(width, x1))
      y1 = Math.max(0, Math.min(height, y1))
      x2 = Math.max(0, Math.min(width, x2))
      y2 = Math.max(0, Math.min(height, y2))

      const boxWidth = x2 - x1
      const boxHeight = y2 - y1
      if (boxWidth < 1 || boxHeight < 1) continue

      const minSide = Math.min(boxWidth, boxHeight)
      const maxSide = Math.max(boxWidth, boxHeight)
      const frameMin = Math.min(width, height)
      if (minSide < MIN_FACE_SIDE_PX && minSide < frameMin * MIN_FACE_SIDE_RATIO) continue
      if (maxSide / Math.max(minSide, 1) > MAX_FACE_ASPECT) continue
      if ((boxWidth * boxHeight) / frameArea > gates.maxAreaRatio) continue

      const box = {x: x1, y: y1, width: boxWidth, height: boxHeight}
      if (!boxLooksLikeFace(image, box, minScore)) continue

      let kps: FaceLandmark5 | null = null
      if (kpsRows) {
        const base = i * 10
        const points = [0, 1, 2, 3, 4].map((p) => ({
          x: (cx + kpsRows.data[base + p * 2] * stride) / detScale,
          y: (cy + kpsRows.data[base + p * 2 + 1] * stride) / detScale,
        }))
        kps = points as FaceLandmark5
      }

      candidates.push({score, box, kps})
    }
  }

  return hardNms(candidates, iouThreshold, maxFaces)
}

async function saveFaceCrop(
  sourceImage: Awaited<ReturnType<typeof Jimp.read>>,
  box: FaceBox,
  outputPath: string,
) {
  const rect = computePaddedSquareCropRect(
    box,
    sourceImage.width,
    sourceImage.height,
    CROP_PADDING,
  )
  const crop = sourceImage.clone().crop({
    x: rect.left,
    y: rect.top,
    w: rect.width,
    h: rect.height,
  })
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

  // Oversample then drop near-duplicates so N kept frames cover more of the video.
  const {targetCount, candidateCount} = computeOversampledFrameCount(framesPerVideo)
  const timestamps = getFrameTimestamps(duration, candidateCount)
  const candidates: Array<{framePath: string; timestamp: string; fingerprint: string}> = []

  for (let index = 0; index < timestamps.length; index++) {
    const output = path.join(tmpDir, `${item.id || 'media'}_${index}.jpg`)
    try {
      await extractVideoFrame({
        input: String(item.path),
        output,
        timestamp: timestamps[index],
        vf: `scale=${frameWidth}:-1`,
      })
      const fingerprint = await frameFingerprint(output)
      candidates.push({framePath: output, timestamp: timestamps[index], fingerprint})
    } catch {
      // Skip broken frames.
    }
  }

  const selected = pickDiverseFrames(candidates, targetCount)
  const selectedPaths = new Set(selected.map((frame) => frame.framePath))
  for (const candidate of candidates) {
    if (selectedPaths.has(candidate.framePath)) continue
    try {
      fs.unlinkSync(candidate.framePath)
    } catch {
      // Ignore cleanup errors.
    }
  }

  for (const frame of selected) {
    frames.push({framePath: frame.framePath, timestamp: frame.timestamp})
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
      ? Math.min(0.75, Math.max(0.5, scoreRaw))
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

    let embedImage: ((
      db: ApiDb,
      imagePath: string,
      box?: FaceBox | null,
      kps?: FaceLandmark5 | null,
    ) => Promise<Float32Array>) | null = null
    let embeddingToJson: ((embedding: Float32Array) => string) | null = null
    try {
      const faceRecognition = require('./faceRecognition') as typeof import('./faceRecognition')
      await faceRecognition.loadEmbedModel(db)
      embedImage = faceRecognition.embedImage
      embeddingToJson = faceRecognition.embeddingToJson
    } catch {
      // Embedding is optional during detect; matching will skip faces without vectors.
    }

    const genderFilter = detectSettings.genderFilter
    let genderReady = false
    if (genderFilter !== 'both') {
      try {
        await loadGenderModel(db)
        genderReady = true
      } catch {
        // Gender filter is best-effort; keep faces if the model cannot load.
        genderReady = false
      }
    }

    for (const frame of extracted.frames) {
      const detections = await detectFacesInFrame(model, frame.framePath, resolvedOptions)
      if (!detections.length) continue

      const sourceImage = await Jimp.read(frame.framePath)
      for (const detection of detections) {
        if (genderReady && genderFilter !== 'both') {
          try {
            const predicted = await estimateGender(sourceImage, detection.box)
            if (!passesGenderFilter(predicted?.gender, genderFilter, predicted?.confidence)) continue
          } catch {
            // Keep the face when gender inference fails.
          }
        }

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

          const blurVariance = estimateBlurVariance(sourceImage, detection.box)
          const matchable = assessMatchability({
            score: detection.score,
            box: detection.box,
            frameWidth: sourceImage.width,
            frameHeight: sourceImage.height,
            blurVariance,
          })

          // Weak detections stay visible in review, but do not get embeddings / auto-match.
          if (
            matchable.ok
            && absoluteCrop
            && fs.existsSync(absoluteCrop)
            && embedImage
            && embeddingToJson
          ) {
            try {
              const vector = await embedImage(db, frame.framePath, detection.box, detection.kps)
              embedding = embeddingToJson(vector)
            } catch {
              embedding = null
            }
          }
        }

        faces.push({
          score: detection.score,
          box: detection.box,
          kps: detection.kps,
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
          const settings = options.applyTags === false
            ? {...matchSettings, mode: 'suggest' as const}
            : matchSettings
          await matchMediaFaces(db, mediaId, {force: Boolean(options.force), settings})
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
    applyTags,
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

  try {
    yield* prepareDetectModel(db)
  } catch (error: unknown) {
    yield {
      type: 'error',
      message: error instanceof Error ? error.message : 'Face detection model is unavailable.',
    }
    return
  }

  if (detectSettings.genderFilter !== 'both') {
    try {
      yield* prepareGenderModel(db)
    } catch (error: unknown) {
      yield {
        type: 'error',
        message: error instanceof Error ? error.message : 'Face gender model is unavailable.',
      }
      return
    }
  }

  try {
    const faceRecognition = require('./faceRecognition') as typeof import('./faceRecognition')
    yield* faceRecognition.prepareEmbedModel(db)
  } catch {
    // Embedding is optional during detect; matching will skip faces without vectors.
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
      applyTags,
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
  FACE_MODEL_SIZE_MB,
  detectFacesInFrame,
  detectMedia,
  ensureFaceCropsForMedia,
  getFaceDetectSettings,
  getFaceDetectionStatus,
  getStatus,
  hasDownloadedModel,
  iterateFaceDetection,
  loadModel,
  prepareDetectModel,
  purgeAllFaceCrops,
  purgeOtherMediaFaceCrops,
  saveFaceCrop,
}
