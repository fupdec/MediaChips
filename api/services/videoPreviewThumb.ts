import type { ApiDb } from '../types/db'
import fs from 'fs'
import path from 'path'
import { createMediaRepository } from '../db/repositories/media'
import { resolveActiveDbFilePath } from './activeDbFileResolver'
import { extractVideoThumbnail } from '../utils/ffmpeg'
import { runWithFfmpegLimit } from './mediaPostProcessQueue'

const THUMB_GENERATION_TIMEOUT_MS = 120_000
const inFlight = new Map<number, Promise<string | null>>()

const VIDEO_THUMB_PATH_RE = /[/\\]media[/\\]videos[/\\]thumbs[/\\](\d+)\.jpg$/i

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
  if (fs.existsSync(outputPath)) return outputPath

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
    extractVideoThumbnail({input: videoPath, outputPath, height: 320}),
    THUMB_GENERATION_TIMEOUT_MS,
    'ffmpeg thumbnail',
  )

  return fs.existsSync(outputPath) ? outputPath : null
}

export async function ensureVideoPreviewThumb(
  mediaId: number,
  db: ApiDb,
  resolveFilePath: (filePath: string) => string | null,
): Promise<string | null> {
  const dbPath = db.path
  if (!dbPath) return null

  const outputPath = getVideoThumbPath(dbPath, mediaId)
  if (fs.existsSync(outputPath)) return outputPath

  const existing = inFlight.get(mediaId)
  if (existing) return existing

  const promise = runWithFfmpegLimit(() =>
    generateVideoPreviewThumb(mediaId, db, resolveFilePath),
  ).finally(() => {
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
  if (existingPath) return existingPath

  const mediaId = parseVideoThumbMediaId(originalFilePath)
  if (mediaId == null) return null

  return ensureVideoPreviewThumb(mediaId, db, resolveFilePath)
}
