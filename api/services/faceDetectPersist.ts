import path from 'path'
import type {FaceBox, FaceDetection, FaceLandmark5} from '../types/faceDetector'
import {relativeFaceCropPath} from './faceCropStore'

export function resolveDetectCropOutputPaths(input: {
  facesDir: string | null
  tmpDir: string | null
  filename: string
  mediaId: number | null
}): {absoluteCrop: string | null; cropRelativePath: string | null} {
  const absoluteCrop = input.facesDir
    ? path.join(input.facesDir, input.filename)
    : (input.tmpDir ? path.join(input.tmpDir, input.filename) : null)
  const cropRelativePath = input.facesDir && input.mediaId != null
    ? relativeFaceCropPath(input.mediaId, input.filename)
    : null
  return {absoluteCrop, cropRelativePath}
}

export function mapDetectionsToPersistedFaceRows(
  mediaId: number,
  faces: Array<Pick<FaceDetection, 'timestamp' | 'score' | 'box' | 'cropRelativePath' | 'embedding'>>,
  persistCrops: boolean,
) {
  return faces.map((face) => ({
    mediaId,
    timestamp: face.timestamp,
    score: face.score,
    x: face.box.x,
    y: face.box.y,
    width: face.box.width,
    height: face.box.height,
    cropPath: persistCrops ? face.cropRelativePath : null,
    embedding: face.embedding ?? null,
  }))
}

export function buildSkippedExistingFaceResult(input: {
  mediaId: number
  mediaPath: string | null
  existing: Array<{
    score?: number | null
    x?: number | null
    y?: number | null
    width?: number | null
    height?: number | null
    timestamp?: string | null
    cropPath?: string | null
  }>
  dbPath: string | null | undefined
}): {
  mediaId: number
  mediaPath: string | null
  frames: number
  faces: FaceDetection[]
  skipped: true
} {
  return {
    mediaId: input.mediaId,
    mediaPath: input.mediaPath,
    frames: 0,
    faces: input.existing.map((face) => ({
      score: Number(face.score || 0),
      box: {
        x: Number(face.x || 0),
        y: Number(face.y || 0),
        width: Number(face.width || 0),
        height: Number(face.height || 0),
      } as FaceBox,
      timestamp: face.timestamp ?? null,
      cropPath: face.cropPath
        ? (path.isAbsolute(face.cropPath) ? face.cropPath : path.join(String(input.dbPath), face.cropPath))
        : null,
      cropRelativePath: face.cropPath ?? null,
      kps: null as FaceLandmark5 | null,
    })),
    skipped: true,
  }
}

export function buildMissingFaceDetectResult(
  mediaId: number | null,
  mediaPath: string | null,
) {
  return {
    mediaId,
    mediaPath,
    frames: 0,
    faces: [] as FaceDetection[],
    missing: true as const,
  }
}

export function buildEmptyFaceDetectResult(
  mediaId: number | null,
  mediaPath: string | null,
) {
  return {
    mediaId,
    mediaPath,
    frames: 0,
    faces: [] as FaceDetection[],
  }
}

export function buildFailedFaceDetectResult(
  mediaId: number | null,
  mediaPath: string | null,
  error: unknown,
) {
  return {
    mediaId,
    mediaPath,
    frames: 0,
    faces: [] as FaceDetection[],
    failed: true as const,
    error: error instanceof Error ? error.message : String(error),
  }
}

export function shouldAttemptDetectionEmbedding(input: {
  matchableOk: boolean
  absoluteCrop: string | null
  cropExists: boolean
  hasEmbedApi: boolean
}): boolean {
  return Boolean(
    input.matchableOk
    && input.absoluteCrop
    && input.cropExists
    && input.hasEmbedApi,
  )
}

export function buildDetectedFaceEntry(input: {
  score: number
  box: FaceBox
  kps: FaceLandmark5 | null
  timestamp: string | null
  cropPath: string | null
  cropRelativePath: string | null
  embedding: string | null
}): FaceDetection {
  return {
    score: input.score,
    box: input.box,
    kps: input.kps,
    timestamp: input.timestamp,
    cropPath: input.cropPath,
    cropRelativePath: input.cropRelativePath,
    embedding: input.embedding,
  }
}

/** Whether gender filtering should run for this detect pass. */
export function shouldPrepareGenderFilter(genderFilter: string): boolean {
  return genderFilter !== 'both'
}

export function resolveDetectMediaIdentity(item: {
  id?: unknown
  path?: unknown
} | null | undefined): {mediaId: number | null; mediaPath: string | null} {
  return {
    mediaId: item?.id != null ? Number(item.id) : null,
    mediaPath: item?.path ? String(item.path) : null,
  }
}

export type DetectMediaPreflight =
  | {kind: 'missing'; mediaId: number | null; mediaPath: string | null}
  | {kind: 'skip-existing'; mediaId: number; mediaPath: string | null}
  | {kind: 'run'; mediaId: number | null; mediaPath: string}

/** Gate before frame extract / ONNX: missing file or already-detected media. */
export function resolveDetectMediaPreflight(input: {
  mediaId: number | null
  mediaPath: string | null
  pathExists: boolean
  force?: boolean
  existingCount: number
}): DetectMediaPreflight {
  if (!input.mediaPath || !input.pathExists) {
    return {kind: 'missing', mediaId: input.mediaId, mediaPath: input.mediaPath}
  }
  if (input.mediaId != null && !input.force && input.existingCount > 0) {
    return {kind: 'skip-existing', mediaId: input.mediaId, mediaPath: input.mediaPath}
  }
  return {kind: 'run', mediaId: input.mediaId, mediaPath: input.mediaPath}
}

export const SCRFD_DEFAULT_MIN_SCORE = 0.5
export const SCRFD_DEFAULT_IOU = 0.4
export const SCRFD_DEFAULT_MAX_FACES = 20

/** Normalize per-frame SCRFD thresholds from detector options. */
export function resolveScrfdFrameDetectParams(options: {
  minScore?: number
  iouThreshold?: number
  maxFacesPerFrame?: number
} = {}): {minScore: number; iouThreshold: number; maxFaces: number} {
  return {
    minScore: Number(options.minScore ?? SCRFD_DEFAULT_MIN_SCORE),
    iouThreshold: Number(options.iouThreshold ?? SCRFD_DEFAULT_IOU),
    maxFaces: Number(options.maxFacesPerFrame ?? SCRFD_DEFAULT_MAX_FACES),
  }
}

export function buildDetectCropFilename(cropIndex: number): string {
  return `face_${String(cropIndex).padStart(3, '0')}.jpg`
}

/** Review crops need a persistent faces/ dir; otherwise temp crops are enough. */
export function shouldEnsureDetectFacesDir(input: {
  persist: boolean
  persistCrops: boolean
  mediaId: number | null
  dbPath?: string | null
}): boolean {
  return Boolean(input.persist && input.persistCrops && input.mediaId != null && input.dbPath)
}

export function shouldClearExistingFaceAssets(input: {
  persist: boolean
  mediaId: number | null
  force?: boolean
}): boolean {
  return Boolean(input.persist && input.mediaId != null && input.force)
}

export function shouldPersistDetectedFaces(input: {
  persist: boolean
  mediaId: number | null
  facesLength: number
}): boolean {
  return Boolean(input.persist && input.mediaId != null && input.facesLength > 0)
}

export function shouldApplyGenderFilterGate(input: {
  genderReady: boolean
  genderFilter: string
}): boolean {
  return input.genderReady && shouldPrepareGenderFilter(input.genderFilter)
}

/**
 * After saveFaceCrop: keep absolute cropPath only when a relative review path exists.
 * Failed saves clear both paths.
 */
export function resolveCropPathsAfterSaveAttempt(input: {
  saveSucceeded: boolean
  absoluteCrop: string | null
  relativeCrop: string | null
}): {cropPath: string | null; cropRelativePath: string | null} {
  if (!input.saveSucceeded) {
    return {cropPath: null, cropRelativePath: null}
  }
  return {
    cropPath: input.relativeCrop ? input.absoluteCrop : null,
    cropRelativePath: input.relativeCrop,
  }
}

export function buildSuccessfulFaceDetectResult(input: {
  mediaId: number | null
  mediaPath: string | null
  frames: number
  faces: FaceDetection[]
}) {
  return {
    mediaId: input.mediaId,
    mediaPath: input.mediaPath,
    frames: input.frames,
    faces: input.faces,
  }
}
