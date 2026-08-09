import type {ApiDb} from '../types/db'
import {spawn} from 'child_process'
import {and, count, eq, isNull, or, sql} from 'drizzle-orm'
import {CHAPTER_MARK_ICON, isChapterMark} from '../../shared/markIcons'
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
import {resolveAutoChapterTitles} from './autoChapterTitles'
import {createMarkThumbsForMarks} from './videoImagesGeneration'

export const AUTO_CHAPTER_TYPE = 'bookmark'
export const AUTO_CHAPTER_ICON = CHAPTER_MARK_ICON
export const AUTO_CHAPTER_TEXT_RE = /^(Chapter\s+(\d+)|(\d{1,2}:)?\d{1,2}:\d{2})$/i

/** Higher than classic 0.3 — downscaled fps sampling is noisier and over-fires. */
export const DEFAULT_SCENE_THRESHOLD = 0.42
/** Hard floor between chapters; adaptive spacing usually picks a larger gap. */
export const DEFAULT_MIN_GAP_SEC = 30
export const DEFAULT_MAX_CHAPTERS = 16
export const DEFAULT_SILENCE_NOISE_DB = -35
export const DEFAULT_SILENCE_MIN_DURATION = 0.8
/** Snap a scene cut to a nearby silence end within this window (seconds). */
export const SILENCE_SNAP_WINDOW_SEC = 2.5
/** Subsample before scene scoring — full-res every-frame decode is the main bottleneck. */
export const SCENE_DETECT_FPS = 2
export const SCENE_DETECT_WIDTH = 320
/** Silence pass at low rate is enough for cut points and much cheaper. */
export const SILENCE_DETECT_SAMPLE_RATE = 8000

/** Duration-aware gap / chapter budget so long videos are not sliced every ~10s. */
export function resolveAutoChapterSpacing(
  durationSec: number,
  options: Pick<AutoChapterDetectOptions, 'minGapSec' | 'maxChapters'> = {},
): {duration: number; minGapSec: number; maxChapters: number} {
  const duration = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0
  const explicitMax = Number(options.maxChapters)
  const explicitGap = Number(options.minGapSec)

  const maxChapters = Number.isFinite(explicitMax) && explicitMax > 0
    ? Math.max(1, Math.floor(explicitMax))
    : duration > 0
      ? Math.min(DEFAULT_MAX_CHAPTERS, Math.max(4, Math.round(duration / 150) + 1))
      : DEFAULT_MAX_CHAPTERS

  const minGapSec = Number.isFinite(explicitGap) && explicitGap > 0
    ? Math.max(1, Math.floor(explicitGap))
    : duration > 0
      ? Math.min(75, Math.max(DEFAULT_MIN_GAP_SEC, Math.round(duration / 24)))
      : DEFAULT_MIN_GAP_SEC

  return {duration, minGapSec, maxChapters}
}

/** Prefer cuts spread across the timeline instead of packing the opening. */
export function pickEvenlySpacedChapterTimes(
  candidates: number[],
  maxChapters: number,
  durationSec: number,
  minGapSec: number,
): number[] {
  const max = Math.max(1, Math.floor(maxChapters))
  const minGap = Math.max(1, minGapSec)
  const duration = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0
  const sorted = [...new Set(
    candidates
      .map((t) => Number(t))
      .filter((t) => Number.isFinite(t) && t >= 0)
      .map((t) => Math.round(t * 100) / 100),
  )].sort((a, b) => a - b)

  if (!sorted.length || sorted[0] !== 0) sorted.unshift(0)
  if (sorted.length <= max) return sorted

  const out: number[] = [0]
  for (let i = 1; i < max; i += 1) {
    const ideal = duration > 0 ? (duration * i) / (max - 1) : sorted[Math.min(i, sorted.length - 1)]
    let best: number | null = null
    let bestDist = Infinity
    const last = out[out.length - 1] ?? 0
    for (const time of sorted) {
      if (time - last < minGap) continue
      if (duration > 0 && duration - time < minGap && i < max - 1) continue
      if (out.includes(time)) continue
      const dist = Math.abs(time - ideal)
      if (dist < bestDist) {
        best = time
        bestDist = dist
      }
    }
    if (best == null) break
    out.push(best)
  }
  return out
}

/** Prefer silence ends that land near a scene cut; do not inject every silence as a chapter. */
export function snapSceneCutsToSilence(
  sceneCuts: number[],
  silenceEnds: number[],
  windowSec = SILENCE_SNAP_WINDOW_SEC,
): number[] {
  const window = Math.max(0.1, Number(windowSec) || SILENCE_SNAP_WINDOW_SEC)
  const silences = silenceEnds
    .map((t) => Number(t))
    .filter((t) => Number.isFinite(t) && t >= 0)
  if (!silences.length) return sceneCuts.map((t) => Number(t)).filter((t) => Number.isFinite(t) && t >= 0)

  return sceneCuts
    .map((t) => Number(t))
    .filter((t) => Number.isFinite(t) && t >= 0)
    .map((cut) => {
      let best = cut
      let bestDist = window
      for (const silence of silences) {
        const dist = Math.abs(silence - cut)
        if (dist <= bestDist) {
          best = silence
          bestDist = dist
        }
      }
      return Math.round(best * 100) / 100
    })
}

export type AutoChapterDetectOptions = {
  threshold?: number
  minGapSec?: number
  maxChapters?: number
  /** Also use ffmpeg silencedetect cut points (smarter scene boundaries). */
  useSilence?: boolean
  silenceNoiseDb?: number
  silenceMinDuration?: number
  /** Prefer Local AI titles when the model is ready; always falls back to heuristics. */
  useLlmTitles?: boolean
  locale?: string
  shouldStop?: () => boolean
  /** 0–1 progress within the current media item (scene/silence/titles). */
  onItemProgress?: (fraction: number) => void
}

export type AutoChapterProgressEvent = {
  type: 'progress' | 'item' | 'complete' | 'error'
  total?: number
  processed?: number
  /** Fraction of the current item (0–1), for smoother progress bars on long files. */
  itemProgress?: number
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
  icon?: string | null
  tagId?: number | null
}): boolean {
  // Chapters are bookmark + chapter icon (legacy type=scene still counts).
  return isChapterMark(mark)
}

export function formatChapterClock(seconds: number): string {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Prefer timestamp labels so chapters are readable in the player. */
export function autoChapterLabel(index: number, timeSec = 0): string {
  void index
  return formatChapterClock(timeSec)
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

/** Parse ffmpeg silencedetect silence_end timestamps. */
export function parseSilenceEndTimes(logText: string): number[] {
  const times: number[] = []
  const re = /silence_end:\s*(-?\d+(?:\.\d+)?)/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(String(logText || ''))) != null) {
    const value = Number(match[1])
    if (Number.isFinite(value) && value >= 0) times.push(value)
  }
  return times
}

/**
 * Keep t=0, enforce adaptive min gap, clamp to duration, spread across the timeline.
 * Raw cuts are mid-scene boundaries; we also ensure the first chapter starts at 0.
 */
export function refineSceneTimestamps(
  rawTimes: number[],
  durationSec: number,
  options: AutoChapterDetectOptions = {},
): number[] {
  const {duration, minGapSec, maxChapters} = resolveAutoChapterSpacing(durationSec, options)

  const sorted = [...rawTimes]
    .map((t) => Number(t))
    .filter((t) => Number.isFinite(t) && t >= 0)
    .map((t) => (duration > 0 ? Math.min(t, Math.max(0, duration - 0.25)) : t))
    .map((t) => Math.round(t * 100) / 100)
    .sort((a, b) => a - b)

  const candidates: number[] = [0]
  for (const time of sorted) {
    if (time < minGapSec) continue
    if (duration > 0 && duration - time < minGapSec) continue
    const last = candidates[candidates.length - 1] ?? 0
    // Collapse near-duplicates before even-spacing so dense openings do not dominate.
    if (time - last < 1) continue
    candidates.push(time)
  }

  return pickEvenlySpacedChapterTimes(candidates, maxChapters, duration, minGapSec)
}

/** Fast scene filter: subsample + downscale before select=gt(scene). */
export function buildSceneDetectVideoFilter(threshold: number): string {
  const parsed = Number(threshold)
  const safe = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SCENE_THRESHOLD
  return `fps=${SCENE_DETECT_FPS},scale=${SCENE_DETECT_WIDTH}:-2,select='gt(scene\\,${safe})',showinfo`
}

export function buildSilenceDetectAudioFilter(noiseDb: number, minDuration: number): string {
  const noise = Number(noiseDb)
  const safeNoise = Number.isFinite(noise) ? noise : DEFAULT_SILENCE_NOISE_DB
  const duration = Number(minDuration)
  const safeDuration = Number.isFinite(duration) && duration > 0
    ? duration
    : DEFAULT_SILENCE_MIN_DURATION
  return `aresample=${SILENCE_DETECT_SAMPLE_RATE},silencedetect=noise=${safeNoise}dB:d=${safeDuration}`
}

/** Parse ffmpeg `time=HH:MM:SS.xx` (or shorter) clocks from progress lines. */
export function parseFfmpegClockToSeconds(value: string): number | null {
  const parts = String(value || '').trim().split(':')
  if (!parts.length || parts.some((part) => part === '' || Number.isNaN(Number(part)))) return null
  const nums = parts.map(Number)
  if (nums.some((n) => !Number.isFinite(n))) return null
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2]
  if (nums.length === 2) return nums[0] * 60 + nums[1]
  if (nums.length === 1) return nums[0]
  return null
}

export function parseFfmpegProgressTimeSeconds(chunk: string): number | null {
  const match = /time=\s*(-?[\d:.]+)/i.exec(String(chunk || ''))
  if (!match) return null
  return parseFfmpegClockToSeconds(match[1])
}

type FfmpegCaptureOptions = {
  args: string[]
  shouldStop?: () => boolean
  durationSec?: number
  onProgress?: (fraction: number) => void
  /** Map local 0–1 decode progress into this range. */
  progressStart?: number
  progressEnd?: number
  errorLabel: string
}

async function runFfmpegCapture(options: FfmpegCaptureOptions): Promise<string> {
  return runWithFfmpegLimit(() => new Promise((resolve, reject) => {
    const proc = spawn(getFfmpegPath(), options.args, {stdio: ['ignore', 'pipe', 'pipe']})
    let stdout = ''
    let stderr = ''
    let settled = false
    let lastEmitAt = 0

    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearInterval(poll)
      if (error) {
        reject(error)
        return
      }
      resolve(`${stdout}\n${stderr}`)
    }

    const killIfStopped = () => {
      if (!options.shouldStop?.()) return
      try {
        proc.kill('SIGKILL')
      } catch {
        // ignore
      }
      finish(new Error('Stopped'))
    }

    const reportProgress = (text: string) => {
      const duration = Number(options.durationSec) || 0
      if (!options.onProgress || duration <= 0) return
      const time = parseFfmpegProgressTimeSeconds(text)
      if (time == null || time < 0) return
      const start = Number(options.progressStart) || 0
      const end = Number.isFinite(Number(options.progressEnd)) ? Number(options.progressEnd) : 1
      const local = Math.min(1, Math.max(0, time / duration))
      const now = Date.now()
      if (now - lastEmitAt < 400 && local < 0.995) return
      lastEmitAt = now
      options.onProgress(start + local * Math.max(0, end - start))
    }

    const poll = setInterval(killIfStopped, 400)
    killIfStopped()

    proc.stdout?.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString()
      stdout += text
      reportProgress(text)
    })
    proc.stderr?.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString()
      stderr += text
      reportProgress(text)
      killIfStopped()
    })
    proc.on('error', (error) => finish(error))
    proc.on('close', (code: number | null) => {
      if (options.shouldStop?.()) {
        finish(new Error('Stopped'))
        return
      }
      // ffmpeg often exits 0 even when writing to null; keep logs either way.
      if (code === 0 || stdout || stderr) {
        finish()
        return
      }
      finish(new Error(`ffmpeg ${options.errorLabel} exited with code ${code}`))
    })
  }))
}

async function runFfmpegSceneDetect(
  filePath: string,
  threshold: number,
  options: {
    shouldStop?: () => boolean
    durationSec?: number
    onProgress?: (fraction: number) => void
  } = {},
): Promise<string> {
  return runFfmpegCapture({
    args: [
      '-hide_banner',
      '-i', filePath,
      '-an',
      '-vf', buildSceneDetectVideoFilter(threshold),
      '-f', 'null',
      '-',
    ],
    shouldStop: options.shouldStop,
    durationSec: options.durationSec,
    onProgress: options.onProgress,
    progressStart: 0,
    progressEnd: options.onProgress ? 0.78 : 1,
    errorLabel: 'scene detect',
  })
}

async function runFfmpegSilenceDetect(
  filePath: string,
  noiseDb: number,
  minDuration: number,
  options: {
    shouldStop?: () => boolean
    durationSec?: number
    onProgress?: (fraction: number) => void
  } = {},
): Promise<string> {
  return runFfmpegCapture({
    args: [
      '-hide_banner',
      '-i', filePath,
      '-vn',
      '-af', buildSilenceDetectAudioFilter(noiseDb, minDuration),
      '-f', 'null',
      '-',
    ],
    shouldStop: options.shouldStop,
    durationSec: options.durationSec,
    onProgress: options.onProgress,
    progressStart: 0.78,
    progressEnd: 0.94,
    errorLabel: 'silence detect',
  })
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

  if (options.shouldStop?.()) throw new Error('Stopped')
  options.onItemProgress?.(0.02)

  const log = await runFfmpegSceneDetect(filePath, threshold, {
    shouldStop: options.shouldStop,
    durationSec: duration,
    onProgress: options.onItemProgress,
  })
  if (options.shouldStop?.()) throw new Error('Stopped')
  options.onItemProgress?.(options.useSilence ? 0.78 : 0.92)

  const sceneCuts = parseScenePtsTimes(log)
  let raw = sceneCuts

  if (options.useSilence) {
    try {
      const silenceLog = await runFfmpegSilenceDetect(
        filePath,
        Number(options.silenceNoiseDb ?? DEFAULT_SILENCE_NOISE_DB) || DEFAULT_SILENCE_NOISE_DB,
        Number(options.silenceMinDuration ?? DEFAULT_SILENCE_MIN_DURATION) || DEFAULT_SILENCE_MIN_DURATION,
        {
          shouldStop: options.shouldStop,
          durationSec: duration,
          onProgress: options.onItemProgress,
        },
      )
      // Snap to silence — do not treat every silence end as its own chapter.
      raw = snapSceneCutsToSilence(sceneCuts, parseSilenceEndTimes(silenceLog))
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'Stopped') throw error
      // Silence pass is best-effort; scene cuts alone still work.
    }
  }

  if (options.shouldStop?.()) throw new Error('Stopped')
  options.onItemProgress?.(0.94)
  const spacing = resolveAutoChapterSpacing(duration, options)
  return refineSceneTimestamps(raw, duration, {
    ...options,
    minGapSec: options.minGapSec ?? spacing.minGapSec,
    maxChapters: options.maxChapters ?? spacing.maxChapters,
  })
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
    options.onItemProgress?.(1)
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
    options.onItemProgress?.(1)
    return {mediaId, chapters: 0, skipped: true, path: media.path}
  }

  if (options.shouldStop?.()) throw new Error('Stopped')
  options.onItemProgress?.(0.95)

  deletePreviousAutoChapters(db, mediaId)
  const titles = await resolveAutoChapterTitles(db, {
    filePathOrName: media.name || media.basename || media.path,
    videoPath: resolved,
    times,
    locale: options.locale,
    useLlmTitles: Boolean(options.useLlmTitles),
    shouldStop: options.shouldStop,
    onProgress: (fraction) => {
      options.onItemProgress?.(0.95 + Math.min(1, Math.max(0, fraction)) * 0.05)
    },
  })
  marksRepo.bulkCreate(times.map((time, index) => ({
    type: AUTO_CHAPTER_TYPE,
    icon: AUTO_CHAPTER_ICON,
    text: titles[index] || autoChapterLabel(index + 1, time),
    time: Math.round(time),
    end: null,
    tagId: null,
    mediaId,
  })))

  // Per-mark JPGs at each chapter time (UI otherwise falls back to the video thumb).
  if (db.path && !options.shouldStop?.()) {
    const createdMarks = marksRepo.findAllForVideo(mediaId).filter(isAutoChapterMark)
    try {
      await createMarkThumbsForMarks(db.path, resolved, createdMarks, {
        force: true,
        shouldStop: options.shouldStop,
        onProgress: (fraction) => {
          options.onItemProgress?.(0.96 + Math.min(1, Math.max(0, fraction)) * 0.04)
        },
      })
    } catch (error) {
      console.error('Failed to create auto-chapter mark thumbs:', error)
    }
  }

  options.onItemProgress?.(1)
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

  // Media with at least 2 chapter marks (bookmark+chapter icon, or legacy scene).
  const withRows = db.drizzle
    .select({mediaId: marks.mediaId})
    .from(marks)
    .innerJoin(media, eq(media.id, marks.mediaId))
    .where(and(
      eq(media.mediaTypeId, videoTypeId),
      isNull(marks.tagId),
      or(
        and(eq(marks.type, AUTO_CHAPTER_TYPE), eq(marks.icon, AUTO_CHAPTER_ICON)),
        eq(marks.type, 'scene'),
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
    useSilence = true,
    silenceNoiseDb,
    silenceMinDuration,
    useLlmTitles = false,
    locale,
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

  yield {type: 'progress', total, processed, created, skipped, failed, itemProgress: 0}

  for (const item of items) {
    if (shouldStop()) {
      yield {type: 'complete', total, processed, created, skipped, failed, stopped: true}
      return
    }

    const pending: AutoChapterProgressEvent[] = []
    let wake: (() => void) | null = null
    const enqueue = (event: AutoChapterProgressEvent) => {
      pending.push(event)
      wake?.()
      wake = null
    }
    const waitForEvent = () => new Promise<void>((resolve) => {
      wake = resolve
    })

    type MediaChapterResult = Awaited<ReturnType<typeof generateAutoChaptersForMedia>>
    // Holder object so TS tracks assignments inside .then/.catch closures.
    const workState: {
      result: MediaChapterResult | null
      error: unknown
      done: boolean
    } = {result: null, error: null, done: false}

    const work = generateAutoChaptersForMedia(db, item.id, {
      force,
      threshold,
      minGapSec,
      maxChapters,
      useSilence,
      silenceNoiseDb,
      silenceMinDuration,
      useLlmTitles,
      locale,
      shouldStop,
      onItemProgress: (itemProgress) => {
        enqueue({
          type: 'progress',
          total,
          processed,
          created,
          skipped,
          failed,
          mediaId: item.id,
          path: item.path,
          itemProgress: Math.min(1, Math.max(0, Number(itemProgress) || 0)),
        })
      },
    })
      .then((value) => {
        workState.result = value
      })
      .catch((error: unknown) => {
        workState.error = error
      })
      .finally(() => {
        workState.done = true
        wake?.()
        wake = null
      })

    while (!workState.done || pending.length) {
      while (pending.length) {
        yield pending.shift() as AutoChapterProgressEvent
      }
      if (workState.done) break
      await waitForEvent()
    }
    await work

    const workError = workState.error
    const result = workState.result
    const stoppedByUser = workError instanceof Error && workError.message === 'Stopped'
    if (stoppedByUser || shouldStop()) {
      yield {type: 'complete', total, processed, created, skipped, failed, stopped: true}
      return
    }

    processed += 1
    if (workError) {
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
        itemProgress: 1,
        error: workError instanceof Error ? workError.message : String(workError),
      }
    } else if (result) {
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
        itemProgress: 1,
      }
    }

    yield {type: 'progress', total, processed, created, skipped, failed, itemProgress: 0}
  }

  yield {type: 'complete', total, processed, created, skipped, failed, stopped: false}
}
