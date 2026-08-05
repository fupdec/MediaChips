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
