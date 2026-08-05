/** Face crop filesystem store: dirs, JPEG writes, purge, review rebuild. */

import type {ApiDb} from '../types/db'
import type {FaceBox} from '../types/faceDetector'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {Jimp} from 'jimp'
import {extractVideoFrame} from '../utils/ffmpeg'
import {createFacesRepository} from '../db/repositories/faces'
import {createMediaRepository} from '../db/repositories/media'
import {resolveExistingPath} from './contentHash'
import {groupItemsByKey} from './faceDetectorMath'
import {computePaddedSquareCropRect, DEFAULT_FACE_CROP_PADDING} from './faceCropGeometry'
import {resolveAbsoluteCropPath} from './faceEnrollmentPaths'

export const FACE_CROPS_RELATIVE_ROOT = 'media/videos/faces'
/** Extract video frames wide enough that face crops stay usable for recognition. */
export const FACE_CROP_FRAME_WIDTH = 1280
const CROP_PADDING = DEFAULT_FACE_CROP_PADDING

export function getFacesDir(dbPath: string, mediaId: number | string) {
  return path.join(dbPath, FACE_CROPS_RELATIVE_ROOT, String(mediaId))
}

export function relativeFaceCropPath(mediaId: number | string, filename: string) {
  return path.join(FACE_CROPS_RELATIVE_ROOT, String(mediaId), filename)
}

export function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, {recursive: true})
  }
}

export function cleanupDir(dirPath: string | null) {
  if (dirPath && fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, {recursive: true, force: true})
  }
}

export function resolveStoredCropPath(dbPath: string, cropPath: string | null | undefined) {
  return resolveAbsoluteCropPath(dbPath, cropPath)
}

export async function saveFaceCrop(
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

/** Remove all on-disk face crops (library auto-scan does not keep them). */
export function purgeAllFaceCrops(db: ApiDb) {
  if (!db.path) return
  const root = path.join(String(db.path), FACE_CROPS_RELATIVE_ROOT)
  cleanupDir(root)
  createFacesRepository(db.drizzle).clearAllCropPaths()
}

/** Keep crops only for the media currently under manual review. */
export function purgeOtherMediaFaceCrops(db: ApiDb, keepMediaId: number) {
  if (!db.path) return
  const root = path.join(String(db.path), FACE_CROPS_RELATIVE_ROOT)
  if (fs.existsSync(root)) {
    for (const entry of fs.readdirSync(root)) {
      if (entry === String(keepMediaId)) continue
      cleanupDir(path.join(root, entry))
    }
  }
  createFacesRepository(db.drizzle).clearCropPathsExceptMediaId(keepMediaId)
}

export function removeExistingFaceAssets(db: ApiDb, mediaId: number) {
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

/**
 * Rebuild face crop JPEGs for review UI from stored boxes + timestamps.
 * Used when faces were detected without persisting crops (auto-scan).
 */
export async function ensureFaceCropsForMedia(db: ApiDb, mediaId: number): Promise<number> {
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
          vf: `scale=${FACE_CROP_FRAME_WIDTH}:-1`,
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
        const relativeCrop = relativeFaceCropPath(mediaId, filename)
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
