import type { ApiDb } from '../types/db'
import fs from 'fs'
import path from 'path'
import { readdir, rmdir, unlink } from 'fs/promises'
import { createSettingsRepository } from '../db/repositories/settings'

export const LEGACY_TIMELINES_CLEANED_SETTING = 'migrations.legacyTimelinesCleaned'

const LEGACY_TIMELINE_FILE_PATTERN = /^\d+_(5|15|25|35|45|55|65|75|85|95)\.jpg$/i
const DEFAULT_BATCH_SIZE = 250
const DEFAULT_SCHEDULE_DELAY_MS = 5000

const yieldToEventLoop = () => new Promise<void>((resolve) => {
  setImmediate(resolve)
})

export function isLegacyTimelineFile(fileName: string): boolean {
  return LEGACY_TIMELINE_FILE_PATTERN.test(fileName)
}

export function getLegacyTimelinesDir(dbPath: string): string {
  return path.join(dbPath, 'media/videos/timelines')
}

function parseBooleanSetting(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  return String(value).toLowerCase() === 'true' || String(value) === '1'
}

export function isLegacyTimelineCleanupDone(db: ApiDb): boolean {
  const row = createSettingsRepository(db.drizzle).findByOption(LEGACY_TIMELINES_CLEANED_SETTING)
  return parseBooleanSetting(row?.value)
}

export function markLegacyTimelineCleanupDone(db: ApiDb): void {
  createSettingsRepository(db.drizzle).upsertByOption(LEGACY_TIMELINES_CLEANED_SETTING, '1')
}

async function listLegacyTimelineFiles(timelinesDir: string): Promise<string[]> {
  if (!fs.existsSync(timelinesDir)) return []

  const files = await readdir(timelinesDir)
  return files.filter((file) => isLegacyTimelineFile(file))
}

export async function removeLegacyTimelineFiles(
  timelinesDir: string,
  {
    batchSize = DEFAULT_BATCH_SIZE,
  }: { batchSize?: number } = {},
): Promise<{removed: number; failed: number}> {
  let removed = 0
  let failed = 0
  let pending = await listLegacyTimelineFiles(timelinesDir)

  while (pending.length) {
    const batch = pending.slice(0, batchSize)

    for (const fileName of batch) {
      try {
        await unlink(path.join(timelinesDir, fileName))
        removed += 1
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
          continue
        }
        failed += 1
      }
    }

    pending = pending.slice(batch.length)
    if (pending.length) {
      await yieldToEventLoop()
    }
  }

  return {removed, failed}
}

async function removeEmptyTimelinesDir(timelinesDir: string): Promise<void> {
  if (!fs.existsSync(timelinesDir)) return

  const remaining = await readdir(timelinesDir)
  if (remaining.length) return

  try {
    await rmdir(timelinesDir)
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      console.warn('Failed to remove empty timelines directory:', error)
    }
  }
}

export async function runLegacyTimelineCleanup(db: ApiDb): Promise<{
  skipped: boolean
  removed: number
  failed: number
}> {
  if (isLegacyTimelineCleanupDone(db)) {
    return {skipped: true, removed: 0, failed: 0}
  }

  const dbPath = db.path
  if (!dbPath) {
    return {skipped: true, removed: 0, failed: 0}
  }

  const timelinesDir = getLegacyTimelinesDir(dbPath)
  const pending = await listLegacyTimelineFiles(timelinesDir)

  if (!pending.length) {
    markLegacyTimelineCleanupDone(db)
    await removeEmptyTimelinesDir(timelinesDir)
    return {skipped: false, removed: 0, failed: 0}
  }

  const {removed, failed} = await removeLegacyTimelineFiles(timelinesDir)
  const remaining = await listLegacyTimelineFiles(timelinesDir)

  if (!remaining.length) {
    markLegacyTimelineCleanupDone(db)
    await removeEmptyTimelinesDir(timelinesDir)
    console.log(`Removed ${removed} legacy timeline file(s)`)
    return {skipped: false, removed, failed}
  }

  console.warn(
    `Legacy timeline cleanup incomplete: removed ${removed}, failed ${failed}, remaining ${remaining.length}`,
  )
  return {skipped: false, removed, failed}
}

let pendingCleanupTimers = new Map<string, NodeJS.Timeout>()

export function scheduleLegacyTimelineCleanup(
  db: ApiDb,
  delayMs = DEFAULT_SCHEDULE_DELAY_MS,
): void {
  const dbPath = db.path
  if (!dbPath || isLegacyTimelineCleanupDone(db) || pendingCleanupTimers.has(dbPath)) {
    return
  }

  const timer = setTimeout(() => {
    pendingCleanupTimers.delete(dbPath)
    void runLegacyTimelineCleanup(db).catch((error: unknown) => {
      console.warn('Legacy timeline cleanup failed:', error)
    })
  }, delayMs)

  pendingCleanupTimers.set(dbPath, timer)

  if (typeof timer.unref === 'function') {
    timer.unref()
  }
}
