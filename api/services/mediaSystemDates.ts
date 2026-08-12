import fs from 'fs/promises'
import exifr from 'exifr'
import {ffprobe} from '../utils/ffmpeg'
import {pickFfprobeTag} from './audioId3Tags'

const EXIF_DATE_KEYS = ['DateTimeOriginal', 'CreateDate', 'DateTimeDigitized'] as const

const FFPROBE_CREATION_KEYS = [
  'creation_time',
  'com.apple.quicktime.creationdate',
  'MediaCreateDate',
  'date',
  'TDRC',
]

/** EXIF often uses `YYYY:MM:DD HH:mm:ss` without timezone. */
const EXIF_DATETIME_RE = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/

export function toIsoDateString(value: unknown): string | null {
  if (value == null || value === '') return null

  if (value instanceof Date) {
    const ms = value.getTime()
    if (!Number.isFinite(ms) || ms <= 0) return null
    return new Date(ms).toISOString()
  }

  if (typeof value === 'number') {
    const ms = value > 1e12 ? value : value * 1000
    if (!Number.isFinite(ms) || ms <= 0) return null
    return new Date(ms).toISOString()
  }

  const raw = String(value).trim()
  if (!raw) return null

  const exifMatch = EXIF_DATETIME_RE.exec(raw)
  if (exifMatch) {
    const [, y, mo, d, h, mi, s] = exifMatch
    const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))
    if (!Number.isFinite(ms) || ms <= 0) return null
    return new Date(ms).toISOString()
  }

  const parsed = Date.parse(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return new Date(parsed).toISOString()
}

export function pickFirstIsoDate(...values: unknown[]): string | null {
  for (const value of values) {
    const iso = toIsoDateString(value)
    if (iso) return iso
  }
  return null
}

export function parseFfprobeCreationTags(
  tags: Record<string, unknown> | null | undefined,
): string | null {
  return toIsoDateString(pickFfprobeTag(tags, FFPROBE_CREATION_KEYS))
}

export async function readEmbeddedImageCreatedAt(pathToFile: string): Promise<string | null> {
  try {
    const exif = await exifr.parse(pathToFile, {pick: [...EXIF_DATE_KEYS]}) as
      | Record<string, unknown>
      | null
      | undefined
    if (!exif) return null
    return pickFirstIsoDate(
      exif.DateTimeOriginal,
      exif.CreateDate,
      exif.DateTimeDigitized,
    )
  } catch {
    return null
  }
}

export async function readEmbeddedImageCreatedAtFromBuffer(buffer: Buffer): Promise<string | null> {
  try {
    const exif = await exifr.parse(buffer, {pick: [...EXIF_DATE_KEYS]}) as
      | Record<string, unknown>
      | null
      | undefined
    if (!exif) return null
    return pickFirstIsoDate(
      exif.DateTimeOriginal,
      exif.CreateDate,
      exif.DateTimeDigitized,
    )
  } catch {
    return null
  }
}

export async function readEmbeddedMediaCreatedAtFromProbe(pathToFile: string): Promise<string | null> {
  try {
    const info = await ffprobe(pathToFile) as {
      format?: {tags?: Record<string, unknown>}
      streams?: Array<{tags?: Record<string, unknown>}>
    }
    const fromFormat = parseFfprobeCreationTags(info.format?.tags)
    if (fromFormat) return fromFormat
    for (const stream of info.streams || []) {
      const fromStream = parseFfprobeCreationTags(stream.tags)
      if (fromStream) return fromStream
    }
    return null
  } catch {
    return null
  }
}

export function isValidFsTimestampMs(ms: unknown): ms is number {
  return typeof ms === 'number' && Number.isFinite(ms) && ms > 0
}

export async function readFsCreatedAtFallback(pathToFile: string): Promise<string | null> {
  try {
    const stats = await fs.stat(pathToFile)
    if (isValidFsTimestampMs(stats.birthtimeMs)) {
      return toIsoDateString(stats.birthtimeMs)
    }
    if (isValidFsTimestampMs(stats.mtimeMs)) {
      return toIsoDateString(stats.mtimeMs)
    }
    return null
  } catch {
    return null
  }
}

export function combineMediaCreatedAt(
  embedded: string | null | undefined,
  fsFallback: string | null | undefined,
): string | null {
  return embedded || fsFallback || null
}

export type MediaCreatedKind = 'image' | 'video' | 'audio' | 'other'

/**
 * Resolve Media Created: embedded EXIF/container date, else FS birthtime, else mtime.
 */
export async function resolveMediaCreatedAt(
  pathToFile: string,
  kind: MediaCreatedKind = 'other',
): Promise<string | null> {
  const {isVirtualZipPath, readZipEntryBuffer} = await import('./zipGallery')

  if (isVirtualZipPath(pathToFile)) {
    if (kind === 'image') {
      const entry = await readZipEntryBuffer(pathToFile)
      if (!entry?.buffer) return null
      return readEmbeddedImageCreatedAtFromBuffer(entry.buffer)
    }
    return null
  }

  let embedded: string | null = null
  if (kind === 'image') {
    embedded = await readEmbeddedImageCreatedAt(pathToFile)
  } else if (kind === 'video' || kind === 'audio') {
    embedded = await readEmbeddedMediaCreatedAtFromProbe(pathToFile)
  }

  if (embedded) return embedded
  return readFsCreatedAtFallback(pathToFile)
}
