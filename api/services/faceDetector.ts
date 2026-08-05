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
} from './faceDetectorMath'
import {
  boxLooksLikeFace,
  estimateBlurVariance,
} from './faceBoxQuality'
import {
  type OrtTensorLike,
} from './faceScrfdDecode'
import {
  collectScrfdCandidates,
  computeScrfdLetterboxSize,
} from './faceScrfdPostprocess'
import {
  applyFaceDetectMediaResult,
  buildFaceDetectCompleteEvent,
  buildFaceDetectProgressEvent,
  createFaceDetectIterateCounters,
} from './faceDetectIterate'
import {
  clampFaceDetectFramesPerVideo,
  clampFaceDetectMinScore,
  resolveFaceDetectRuntimeOptions,
} from './faceSettingsParse'
import {
  cleanupDir,
  ensureDir,
  ensureFaceCropsForMedia,
  FACE_CROP_FRAME_WIDTH,
  getFacesDir,
  purgeAllFaceCrops,
  purgeOtherMediaFaceCrops,
  relativeFaceCropPath,
  removeExistingFaceAssets,
  saveFaceCrop,
} from './faceCropStore'
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
const DEFAULT_FRAME_WIDTH = FACE_CROP_FRAME_WIDTH
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

  const {newWidth, newHeight, detScale} = computeScrfdLetterboxSize(width, height, DET_INPUT_SIZE)

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

  const gates = qualityGatesForScore(minScore)
  const candidates = collectScrfdCandidates({
    outputs: outputs as Record<string, OrtTensorLike | undefined>,
    outputNames: names,
    detScale,
    width,
    height,
    inputSize: DET_INPUT_SIZE,
    minScore,
    maxAreaRatio: gates.maxAreaRatio,
    acceptBox: (box) => boxLooksLikeFace(image, box, minScore),
  })

  return hardNms(candidates, iouThreshold, maxFaces)
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

async function detectMedia(
  db: ApiDb,
  item: FaceDetectorMediaItem,
  options: FaceDetectorOptions = {},
): Promise<FaceDetectorMediaResult> {
  const mediaId = item?.id != null ? Number(item.id) : null
  const mediaPath = item?.path ? String(item.path) : null
  const persist = options.persist !== false
  // Crops are for manual review visuals only — auto-scan stores embeddings, not JPEGs.
  const detectSettings = getFaceDetectSettings(db)
  const resolvedOptions = resolveFaceDetectRuntimeOptions(options, detectSettings)
  const persistCrops = resolvedOptions.persistCrops

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
              cropRelativePath = relativeFaceCropPath(mediaId, filename)
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
  let counters = createFaceDetectIterateCounters()

  yield buildFaceDetectProgressEvent(counters, total)

  for (const item of items) {
    if (shouldStop()) {
      yield buildFaceDetectCompleteEvent(counters, total, true)
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

    counters = applyFaceDetectMediaResult(counters, {
      missing: result.missing,
      failed: result.failed,
      skipped: result.skipped,
      facesLength: result.faces.length,
    })

    yield buildFaceDetectProgressEvent(counters, total, {
      current: result.mediaPath || undefined,
      mediaId: result.mediaId,
    })
  }

  yield buildFaceDetectCompleteEvent(counters, total, false)
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
