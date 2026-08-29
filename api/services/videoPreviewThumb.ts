import type { ApiDb } from '../types/db'
import fs from 'fs'
import path from 'path'
import { createMediaRepository } from '../db/repositories/media'
import { resolveActiveDbFilePath } from './activeDbFileResolver'
import { extractVideoThumbnail } from '../utils/ffmpeg'
import { VIDEO_THUMB_HEIGHT, VIDEO_THUMB_JPEG_QUALITY } from '../../shared/videoPreview'

const THUMB_GENERATION_TIMEOUT_MS = 120_000
/** Reject empty/corrupt stubs left by failed FFmpeg 6 single-image writes. */
export const MIN_USABLE_VIDEO_THUMB_BYTES = 512
const inFlight = new Map<number, Promise<string | null>>()

export function parseVideoThumbMediaId(filePath: string): number | null {
  const normalized = filePath.replace(/\\/g, '/')
  const match = normalized.match(/\/media\/videos\/thumbs\/(\d+)\.jpg$/i)
  if (!match) return null

  const mediaId = Number(match[1])
  return Number.isFinite(mediaId) ? mediaId : null
}

export function isVideoThumbRequest(filePath: string): boolean {
  return parseVideoThumbMediaId(filePath) != null
}

export function getVideoThumbPath(dbPath: string, mediaId: number): string {
  return path.join(dbPath, 'media/videos/thumbs', `${mediaId}.jpg`)
}

/**
 * True when the on-disk thumb is large enough and starts with a JPEG SOI marker.
 * Empty / tiny files from failed FFmpeg runs must not short-circuit regeneration.
 */
export function isUsableVideoThumbFile(filePath: string): boolean {
  try {
    const stats = fs.statSync(filePath)
    if (!stats.isFile() || stats.size < MIN_USABLE_VIDEO_THUMB_BYTES) {
      return false
    }

    const fd = fs.openSync(filePath, 'r')
    try {
      const header = Buffer.alloc(2)
      const bytesRead = fs.readSync(fd, header, 0, 2, 0)
      if (bytesRead < 2) return false
      return header[0] === 0xff && header[1] === 0xd8
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return false
  }
}

function removeUnusableVideoThumbFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  } catch (error) {
    console.warn('Failed to remove unusable video thumb:', filePath, error)
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    }),
  ])
}

async function generateVideoPreviewThumb(
  mediaId: number,
  db: ApiDb,
  resolveFilePath: (filePath: string) => string | null,
): Promise<string | null> {
  const dbPath = db.path
  if (!dbPath) return null

  const outputPath = getVideoThumbPath(dbPath, mediaId)
  if (isUsableVideoThumbFile(outputPath)) return outputPath
  if (fs.existsSync(outputPath)) {
    removeUnusableVideoThumbFile(outputPath)
  }

  const media = createMediaRepository(db.drizzle).findById(mediaId)
  if (!media?.path) return null

  const videoPath = resolveActiveDbFilePath(media.path, dbPath)
    ?? resolveFilePath(media.path)
  if (!videoPath || !fs.existsSync(videoPath)) return null

  const thumbsDir = path.dirname(outputPath)
  if (!fs.existsSync(thumbsDir)) {
    fs.mkdirSync(thumbsDir, {recursive: true})
  }

  await withTimeout(
    extractVideoThumbnail({
      input: videoPath,
      outputPath,
      height: VIDEO_THUMB_HEIGHT,
      jpegQuality: VIDEO_THUMB_JPEG_QUALITY,
    }),
    THUMB_GENERATION_TIMEOUT_MS,
    'ffmpeg thumbnail',
  )

  return isUsableVideoThumbFile(outputPath) ? outputPath : null
}

export async function ensureVideoPreviewThumb(
  mediaId: number,
  db: ApiDb,
  resolveFilePath: (filePath: string) => string | null,
): Promise<string | null> {
  const dbPath = db.path
  if (!dbPath) return null

  const outputPath = getVideoThumbPath(dbPath, mediaId)
  if (isUsableVideoThumbFile(outputPath)) return outputPath
  if (fs.existsSync(outputPath)) {
    removeUnusableVideoThumbFile(outputPath)
  }

  const existing = inFlight.get(mediaId)
  if (existing) return existing

  // ffmpeg/ffprobe concurrency is enforced inside api/utils/ffmpeg.
  const promise = generateVideoPreviewThumb(mediaId, db, resolveFilePath).finally(() => {
    inFlight.delete(mediaId)
  })

  inFlight.set(mediaId, promise)
  return promise
}

export async function resolveVideoThumbFilePath(
  originalFilePath: string,
  db: ApiDb,
  resolveFilePath: (filePath: string) => string | null,
): Promise<string | null> {
  const existingPath = resolveFilePath(originalFilePath)
  const mediaId = parseVideoThumbMediaId(originalFilePath)

  if (existingPath) {
    // Non-thumb assets: return as resolved. Video thumbs: only when usable.
    if (mediaId == null || isUsableVideoThumbFile(existingPath)) {
      return existingPath
    }
    removeUnusableVideoThumbFile(existingPath)
  }

  if (mediaId == null) return null

  return ensureVideoPreviewThumb(mediaId, db, resolveFilePath)
}
