import type { ApiDb } from '../types/db'
import type { ModelStatus } from '../types/mlModels'
import type {
  FaceBox,
  FaceDetection,
  FaceDetectionGenerationStatus,
  FaceDetectorMediaItem,
  FaceDetectorMediaResult,
  FaceDetectorOptions,
  FaceLandmark5,
} from '../types/faceDetector'
import fs from 'fs'
import { createFacesRepository } from '../db/repositories/faces'
import { createMediaRepository } from '../db/repositories/media'
import { createMediaTypesRepository } from '../db/repositories/mediaTypes'
import { createSettingsRepository } from '../db/repositories/settings'
import { assessMatchability } from './matchGates'
import {
  estimateGender,
  loadGenderModel,
  passesGenderFilter,
  type FaceGenderFilter,
} from './faceGender'
import {
  hardNms,
  qualityGatesForScore,
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
  parseFaceDetectSettingsFromMap,
  resolveFaceDetectRuntimeOptions,
} from './faceSettingsParse'
import {
  cleanupDir,
  ensureDir,
  ensureFaceCropsForMedia,
  getFacesDir,
  purgeAllFaceCrops,
  purgeOtherMediaFaceCrops,
  removeExistingFaceAssets,
  saveFaceCrop,
} from './faceCropStore'
import {
  SCRFD_DEFAULT_MIN_SCORE,
  buildDetectCropFilename,
  buildDetectedFaceEntry,
  buildEmptyFaceDetectResult,
  buildFailedFaceDetectResult,
  buildMissingFaceDetectResult,
  buildSkippedExistingFaceResult,
  buildSuccessfulFaceDetectResult,
  mapDetectionsToPersistedFaceRows,
  resolveCropPathsAfterSaveAttempt,
  resolveDetectCropOutputPaths,
  resolveDetectMediaIdentity,
  resolveDetectMediaPreflight,
  resolveScrfdFrameDetectParams,
  shouldApplyGenderFilterGate,
  shouldAttemptDetectionEmbedding,
  shouldClearExistingFaceAssets,
  shouldEnsureDetectFacesDir,
  shouldPersistDetectedFaces,
  shouldPrepareGenderFilter,
} from './faceDetectPersist'
import {extractFramesForMedia} from './faceFrameExtract'
import {mapDetectFramesWithConcurrency} from './faceDetectFrameMap'
import {embedImage as embedImageRuntime, loadEmbedModel} from './faceEmbedRuntime'
import {embeddingToJson} from './faceMatchScoring'
import {
  buildCachedModelReadyEvent,
  resolveCachedModelStatus,
} from './faceModelStatus'
import {buildFaceDetectionStatusSnapshot} from './faceStatusSnapshots'
import {packLetterboxedRgbaToNchw} from './faceTensorPrep'
import {readFaceRaster, resizeFaceRaster, type FaceRasterImage} from './faceRaster'
import {
  downloadCachedModelIfNeeded,
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
  return parseFaceDetectSettingsFromMap(map, SCRFD_DEFAULT_MIN_SCORE)
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
  percent?: number
  loaded?: number
  total?: number | null
  etaSeconds?: number | null
}

async function* prepareDetectModel(
  db: ApiDb,
  options: {shouldStop?: () => boolean} = {},
): AsyncGenerator<DetectPrepEvent> {
  const needsDownload = !hasDownloadedModel(db)
  if (needsDownload) {
    for await (const event of downloadCachedModelIfNeeded(db, {
      modelId: FACE_MODEL_ID,
      filename: FACE_MODEL_FILENAME,
      url: FACE_MODEL_URL,
      errorLabel: 'face model',
      expectedBytes: FACE_MODEL_SIZE_MB * 1024 * 1024,
      label: 'face detection',
      phase: 'downloading_detect',
      shouldStop: options.shouldStop,
    })) {
      yield {
        ...event,
        sizeMb: FACE_MODEL_SIZE_MB,
      }
    }
  }
  await loadModel(db)
  if (needsDownload) {
    yield buildCachedModelReadyEvent({
      phase: 'detect_ready',
      sizeMb: FACE_MODEL_SIZE_MB,
      kind: 'face detection',
    })
  }
}

function getStatus(db: ApiDb, enabled: boolean = true): ModelStatus {
  return resolveCachedModelStatus({
    modelId: FACE_MODEL_ID,
    path: getWritableModelCacheDir(db),
    sessionLoaded: Boolean(session),
    loading: Boolean(loadingPromise),
    lastError,
    downloaded: hasDownloadedModel(db),
    enabled,
  })
}

async function imageToScrfdInput(framePath: string): Promise<{
  tensor: OrtTensor
  width: number
  height: number
  detScale: number
  image: FaceRasterImage
}> {
  const ort = getOrt()
  const image = await readFaceRaster(framePath)
  const width = image.width
  const height = image.height

  const {newWidth, newHeight, detScale} = computeScrfdLetterboxSize(width, height, DET_INPUT_SIZE)

  const resized = await resizeFaceRaster(image, newWidth, newHeight)
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
  const {minScore, iouThreshold, maxFaces} = resolveScrfdFrameDetectParams(options)
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

async function detectMedia(
  db: ApiDb,
  item: FaceDetectorMediaItem,
  options: FaceDetectorOptions = {},
): Promise<FaceDetectorMediaResult> {
  const {mediaId, mediaPath} = resolveDetectMediaIdentity(item)
  const persist = options.persist !== false
  // Crops are for manual review visuals only — auto-scan stores embeddings, not JPEGs.
  const detectSettings = getFaceDetectSettings(db)
  const resolvedOptions = resolveFaceDetectRuntimeOptions(options, detectSettings)
  const persistCrops = resolvedOptions.persistCrops

  const existing = mediaId != null && !options.force
    ? createFacesRepository(db.drizzle).findByMediaId(mediaId)
    : []
  const preflight = resolveDetectMediaPreflight({
    mediaId,
    mediaPath,
    pathExists: Boolean(mediaPath && fs.existsSync(mediaPath)),
    force: options.force,
    existingCount: existing.length,
  })

  if (preflight.kind === 'missing') {
    return buildMissingFaceDetectResult(preflight.mediaId, preflight.mediaPath)
  }

  if (preflight.kind === 'skip-existing') {
    return buildSkippedExistingFaceResult({
      mediaId: preflight.mediaId,
      mediaPath: preflight.mediaPath,
      existing,
      dbPath: db.path,
    })
  }

  let tmpDir: string | null = null
  try {
    const model = await loadModel(db)
    const extracted = await extractFramesForMedia(item, resolvedOptions)
    tmpDir = extracted.tmpDir

    if (!extracted.frames.length) {
      return buildEmptyFaceDetectResult(mediaId, mediaPath)
    }

    if (shouldClearExistingFaceAssets({persist, mediaId, force: options.force})) {
      removeExistingFaceAssets(db, mediaId!)
    }

    const faces: FaceDetection[] = []
    let cropIndex = 0
    let facesDir: string | null = null
    const ensureFacesDir = () => {
      if (facesDir || !shouldEnsureDetectFacesDir({
        persist,
        persistCrops,
        mediaId,
        dbPath: db.path,
      })) {
        return facesDir
      }
      facesDir = getFacesDir(db.path!, mediaId!)
      ensureDir(facesDir)
      return facesDir
    }

    let embedImage: typeof embedImageRuntime | null = null
    let toJson: typeof embeddingToJson | null = null
    try {
      await loadEmbedModel(db)
      embedImage = embedImageRuntime
      toJson = embeddingToJson
    } catch {
      // Embedding is optional during detect; matching will skip faces without vectors.
    }

    const genderFilter = detectSettings.genderFilter
    let genderReady = false
    if (shouldPrepareGenderFilter(genderFilter)) {
      try {
        await loadGenderModel(db)
        genderReady = true
      } catch {
        // Gender filter is best-effort; keep faces if the model cannot load.
        genderReady = false
      }
    }

    // Parallelize SCRFD across frames; keep cropIndex / gender / embed / DB serial.
    const frameBatches = await mapDetectFramesWithConcurrency(
      extracted.frames,
      {
        detect: (frame) => detectFacesInFrame(model, frame.framePath, resolvedOptions),
        readImage: (framePath) => readFaceRaster(framePath),
      },
    )

    for (const {frame, detections, sourceImage} of frameBatches) {
      if (!detections.length || !sourceImage) continue

      for (const detection of detections) {
        if (shouldApplyGenderFilterGate({genderReady, genderFilter})) {
          try {
            const predicted = await estimateGender(sourceImage, detection.box)
            if (!passesGenderFilter(predicted?.gender, genderFilter, predicted?.confidence)) continue
          } catch {
            // Keep the face when gender inference fails.
          }
        }

        let embedding: string | null = null
        const filename = buildDetectCropFilename(cropIndex)
        cropIndex += 1
        const dir = ensureFacesDir()
        // Persist only for manual review; otherwise write a temp crop just for embedding.
        const {absoluteCrop, cropRelativePath: relativeCrop} = resolveDetectCropOutputPaths({
          facesDir: dir,
          tmpDir,
          filename,
          mediaId,
        })

        let saveSucceeded = false
        if (absoluteCrop) {
          try {
            await saveFaceCrop(sourceImage, detection.box, absoluteCrop)
            saveSucceeded = true
          } catch {
            saveSucceeded = false
          }
        }

        const {cropPath, cropRelativePath} = resolveCropPathsAfterSaveAttempt({
          saveSucceeded,
          absoluteCrop,
          relativeCrop,
        })

        if (absoluteCrop && saveSucceeded) {
          const blurVariance = estimateBlurVariance(sourceImage, detection.box)
          const matchable = assessMatchability({
            score: detection.score,
            box: detection.box,
            frameWidth: sourceImage.width,
            frameHeight: sourceImage.height,
            blurVariance,
          })

          // Weak detections stay visible in review, but do not get embeddings / auto-match.
          if (shouldAttemptDetectionEmbedding({
            matchableOk: matchable.ok,
            absoluteCrop,
            cropExists: fs.existsSync(absoluteCrop),
            hasEmbedApi: Boolean(embedImage && toJson),
          })) {
            try {
              const vector = await embedImage!(db, frame.framePath, detection.box, detection.kps)
              embedding = toJson!(vector)
            } catch {
              embedding = null
            }
          }
        }

        faces.push(buildDetectedFaceEntry({
          score: detection.score,
          box: detection.box,
          kps: detection.kps,
          timestamp: frame.timestamp,
          cropPath,
          cropRelativePath,
          embedding,
        }))
      }
    }

    if (shouldPersistDetectedFaces({persist, mediaId, facesLength: faces.length})) {
      createFacesRepository(db.drizzle).bulkCreate(
        mapDetectionsToPersistedFaceRows(mediaId!, faces, Boolean(persistCrops)),
      )

      if (persistCrops) {
        purgeOtherMediaFaceCrops(db, mediaId!)
      }
      // Match-after-detect is owned by faceDetectOrchestrate / TasksFaces —
      // keep this module free of a faceRecognition import cycle.
    }

    return buildSuccessfulFaceDetectResult({
      mediaId,
      mediaPath,
      frames: extracted.frames.length,
      faces,
    })
  } catch (error: unknown) {
    return buildFailedFaceDetectResult(mediaId, mediaPath, error)
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
  return buildFaceDetectionStatusSnapshot({
    total,
    generated,
    faces: facesRepo.countAll(),
  })
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
  loadModel,
  prepareDetectModel,
  purgeAllFaceCrops,
  purgeOtherMediaFaceCrops,
  saveFaceCrop,
}
