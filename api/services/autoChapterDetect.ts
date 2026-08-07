import type {ApiDb} from '../types/db'
import {spawn} from 'child_process'
import {and, count, eq, isNull, or, sql} from 'drizzle-orm'
import {createMarksRepository} from '../db/repositories/marks'
import {createMediaRepository} from '../db/repositories/media'
import {createMediaTypesRepository} from '../db/repositories/mediaTypes'
import {marks} from '../db/schema/marks'
import {media} from '../db/schema/media'
import {resolveExistingPath} from './contentHash'
import {deleteMarkGeneratedAsset} from './localAssetCleanup'
import {ffprobe} from '../utils/ffmpeg'
import {getFfmpegPath} from '../utils/ffmpegPaths'
import {runWithFfmpegLimit} from './mediaPostProcessQueue'

export const AUTO_CHAPTER_TYPE = 'scene'
export const AUTO_CHAPTER_TEXT_RE = /^Chapter\s+(\d+)$/i

export const DEFAULT_SCENE_THRESHOLD = 0.35
export const DEFAULT_MIN_GAP_SEC = 10
export const DEFAULT_MAX_CHAPTERS = 40

export type AutoChapterDetectOptions = {
  threshold?: number
  minGapSec?: number
  maxChapters?: number
}

export type AutoChapterProgressEvent = {
  type: 'progress' | 'item' | 'complete' | 'error'
  total?: number
  processed?: number
  created?: number
  skipped?: number
  failed?: number
  stopped?: boolean
  mediaId?: number
  path?: string | null
  chapters?: number
  message?: string
  error?: string
}

export function isAutoChapterMark(mark: {
  type?: string | null
  text?: string | null
  tagId?: number | null
}): boolean {
  if (String(mark.type || '').toLowerCase() !== AUTO_CHAPTER_TYPE) return false
  if (mark.tagId != null) return false
  const text = String(mark.text || '').trim()
  if (!text) return true
  return AUTO_CHAPTER_TEXT_RE.test(text)
}

export function autoChapterLabel(index: number): string {
  return `Chapter ${Math.max(1, Math.floor(index))}`
}

/** Parse ffmpeg showinfo / metadata pts_time lines from stderr/stdout. */
export function parseScenePtsTimes(logText: string): number[] {
  const times: number[] = []
  const re = /pts_time[:=]\s*(-?\d+(?:\.\d+)?)/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(String(logText || ''))) != null) {
    const value = Number(match[1])
    if (Number.isFinite(value) && value >= 0) times.push(value)
  }
  return times
}

/**
 * Keep t=0, enforce min gap, clamp to duration, cap count.
 * Raw cuts are mid-scene boundaries; we also ensure the first chapter starts at 0.
 */
export function refineSceneTimestamps(
  rawTimes: number[],
  durationSec: number,
  options: AutoChapterDetectOptions = {},
): number[] {
  const minGap = Math.max(1, Number(options.minGapSec ?? DEFAULT_MIN_GAP_SEC) || DEFAULT_MIN_GAP_SEC)
  const maxChapters = Math.max(1, Number(options.maxChapters ?? DEFAULT_MAX_CHAPTERS) || DEFAULT_MAX_CHAPTERS)
  const duration = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0

  const sorted = [...rawTimes]
    .map((t) => Number(t))
    .filter((t) => Number.isFinite(t) && t >= 0)
    .map((t) => (duration > 0 ? Math.min(t, Math.max(0, duration - 0.25)) : t))
    .sort((a, b) => a - b)

  const out: number[] = [0]
  for (const time of sorted) {
    if (time < minGap) continue
    const last = out[out.length - 1] ?? 0
    if (time - last < minGap) continue
    if (duration > 0 && duration - time < minGap) continue
    out.push(Math.round(time * 100) / 100)
    if (out.length >= maxChapters) break
  }
  return out
}

async function runFfmpegSceneDetect(
  filePath: string,
  threshold: number,
): Promise<string> {
  return runWithFfmpegLimit(() => new Promise((resolve, reject) => {
    const vf = `select='gt(scene\\,${threshold})',showinfo`
    const args = [
      '-hide_banner',
      '-i', filePath,
      '-an',
      '-vf', vf,
      '-f', 'null',
      '-',
    ]
    const proc = spawn(getFfmpegPath(), args, {stdio: ['ignore', 'pipe', 'pipe']})
    let stdout = ''
    let stderr = ''
    proc.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString()
    })
    proc.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString()
    })
    proc.on('error', reject)
    proc.on('close', (code: number | null) => {
      // ffmpeg often exits 0 even when writing to null; keep logs either way.
      if (code === 0 || stdout || stderr) {
        resolve(`${stdout}\n${stderr}`)
        return
      }
      reject(new Error(`ffmpeg scene detect exited with code ${code}`))
    })
  }))
}

export async function detectSceneChapterTimes(
  filePath: string,
  options: AutoChapterDetectOptions = {},
): Promise<number[]> {
  const threshold = Number(options.threshold ?? DEFAULT_SCENE_THRESHOLD) || DEFAULT_SCENE_THRESHOLD
  let duration = 0
  try {
    const probe = await ffprobe(filePath)
    duration = Number(probe.format?.duration) || 0
  } catch {
    duration = 0
  }

  const log = await runFfmpegSceneDetect(filePath, threshold)
  const raw = parseScenePtsTimes(log)
  return refineSceneTimestamps(raw, duration, options)
}

function deletePreviousAutoChapters(
  db: ApiDb,
  mediaId: number,
): number {
  const marksRepo = createMarksRepository(db.drizzle)
  const existing = marksRepo.findAllForVideo(mediaId)
  let removed = 0
  for (const mark of existing) {
    if (!isAutoChapterMark(mark) || mark.id == null) continue
    if (db.path) deleteMarkGeneratedAsset(db.path, mark.id)
    marksRepo.deleteById(mark.id)
    removed += 1
  }
  return removed
}

export async function generateAutoChaptersForMedia(
  db: ApiDb,
  mediaId: number,
  options: AutoChapterDetectOptions & {force?: boolean} = {},
): Promise<{mediaId: number; chapters: number; skipped: boolean; path: string | null}> {
  const mediaRepo = createMediaRepository(db.drizzle)
  const marksRepo = createMarksRepository(db.drizzle)
  const media = mediaRepo.findById(mediaId)
  if (!media?.path) {
    throw new Error(`Media ${mediaId} not found`)
  }

  const existingAuto = marksRepo.findAllForVideo(mediaId).filter(isAutoChapterMark)
  if (existingAuto.length && !options.force) {
    return {
      mediaId,
      chapters: existingAuto.length,
      skipped: true,
      path: media.path,
    }
  }

  const resolved = await resolveExistingPath(media.path)
  if (!resolved) {
    throw new Error(`File missing: ${media.path}`)
  }

  const times = await detectSceneChapterTimes(resolved, options)
  // One cut only (just 0) is not useful — treat as no chapters.
  if (times.length < 2) {
    if (options.force) deletePreviousAutoChapters(db, mediaId)
    return {mediaId, chapters: 0, skipped: true, path: media.path}
  }

  deletePreviousAutoChapters(db, mediaId)
  marksRepo.bulkCreate(times.map((time, index) => ({
    type: AUTO_CHAPTER_TYPE,
    text: autoChapterLabel(index + 1),
    time: Math.round(time),
    end: null,
    tagId: null,
    mediaId,
  })))

  return {mediaId, chapters: times.length, skipped: false, path: media.path}
}

async function getVideoMediaTypeId(db: ApiDb): Promise<number | null> {
  const mediaTypesRepo = createMediaTypesRepository(db.drizzle)
  return mediaTypesRepo.findByType('video')?.id || null
}

export function getAutoChapterGenerationStatus(db: ApiDb): {
  total: number
  withChapters: number
  pending: number
} {
  const videoTypeId = mediaTypesRepoSafe(db)
  if (videoTypeId == null) return {total: 0, withChapters: 0, pending: 0}

  const totalRow = db.drizzle
    .select({count: count()})
    .from(media)
    .where(eq(media.mediaTypeId, videoTypeId))
    .get()
  const total = Number(totalRow?.count ?? 0)

  // Media with at least 2 auto-chapter marks (type=scene, no tag, Chapter N / empty text).
  const withRows = db.drizzle
    .select({mediaId: marks.mediaId})
    .from(marks)
    .innerJoin(media, eq(media.id, marks.mediaId))
    .where(and(
      eq(media.mediaTypeId, videoTypeId),
      eq(marks.type, AUTO_CHAPTER_TYPE),
      isNull(marks.tagId),
      or(
        isNull(marks.text),
        eq(marks.text, ''),
        sql`${marks.text} LIKE 'Chapter %'`,
      ),
    ))
    .groupBy(marks.mediaId)
    .having(sql`count(*) >= 2`)
    .all()

  const withChapters = withRows.length
  return {
    total,
    withChapters,
    pending: Math.max(0, total - withChapters),
  }
}

function mediaTypesRepoSafe(db: ApiDb): number | null {
  try {
    const mediaTypesRepo = createMediaTypesRepository(db.drizzle)
    return mediaTypesRepo.findByType('video')?.id || null
  } catch {
    return null
  }
}

export async function* iterateAutoChapterGeneration(
  db: ApiDb,
  {
    shouldStop = () => false,
    force = false,
    mediaIds,
    threshold,
    minGapSec,
    maxChapters,
  }: AutoChapterDetectOptions & {
    shouldStop?: () => boolean
    force?: boolean
    mediaIds?: Array<number | string>
  } = {},
): AsyncGenerator<AutoChapterProgressEvent> {
  const mediaRepo = createMediaRepository(db.drizzle)
  const videoTypeId = await getVideoMediaTypeId(db)

  let items: Array<{id: number; path: string | null}> = []
  if (Array.isArray(mediaIds) && mediaIds.length) {
    for (const raw of mediaIds) {
      const id = Number(raw)
      if (!Number.isFinite(id)) continue
      const row = mediaRepo.findById(id)
      if (row) items.push({id: row.id, path: row.path})
    }
  } else if (videoTypeId != null) {
    items = mediaRepo.findByMediaType(videoTypeId).map((row) => ({
      id: row.id,
      path: row.path,
    }))
  }

  const total = items.length
  let processed = 0
  let created = 0
  let skipped = 0
  let failed = 0

  yield {type: 'progress', total, processed, created, skipped, failed}

  for (const item of items) {
    if (shouldStop()) {
      yield {type: 'complete', total, processed, created, skipped, failed, stopped: true}
      return
    }

    try {
      const result = await generateAutoChaptersForMedia(db, item.id, {
        force,
        threshold,
        minGapSec,
        maxChapters,
      })
      processed += 1
      if (result.skipped || result.chapters < 2) skipped += 1
      else created += 1
      yield {
        type: 'item',
        total,
        processed,
        created,
        skipped,
        failed,
        mediaId: item.id,
        path: result.path,
        chapters: result.chapters,
      }
    } catch (error: unknown) {
      processed += 1
      failed += 1
      yield {
        type: 'item',
        total,
        processed,
        created,
        skipped,
        failed,
        mediaId: item.id,
        path: item.path,
        chapters: 0,
        error: error instanceof Error ? error.message : String(error),
      }
    }

    yield {type: 'progress', total, processed, created, skipped, failed}
  }

  yield {type: 'complete', total, processed, created, skipped, failed, stopped: false}
}
