/**
 * Risk assessment for adding a watched folder.
 * Grades are ratio of fileCount / platformLimit (after HDD factor).
 *
 * Calibrated once on darwin + @parcel/watcher (2026-08-31):
 * - ~25k files in ~/Downloads: ready ~6ms, RSS Δ ~0, add/unlink stable
 * - native FSEvents does not open per-dir fd watchers like chokidar
 * → darwin native soft limit raised from chokidar-era 10_500 to 40_000
 */
import fs from 'fs'
import path from 'path'
import {execFile} from 'child_process'
import {promisify} from 'util'
import {readdir} from 'fs/promises'
import {isPathUnderExcluded} from '../utils/watchedFolderExcludes'
import {normalizeMediaPath} from '../utils/normalizeUserPath'
import {needsPollingForPath} from '../utils/watchPathHints'

const execFileAsync = promisify(execFile)

/** Soft file-count ceilings per platform / mode (chosen watcher: @parcel/watcher). */
export const PLATFORM_LIMIT_NATIVE: Record<string, number> = {
  // Calibrated on darwin arm64 with parcel (live ~/Downloads ~25k OK).
  darwin: 40_000,
  // Literature / prior chokidar Win notes; not re-calibrated here.
  win32: 20_000,
  linux: 8_192,
}

export const PLATFORM_LIMIT_POLLING = 5_000

/** Yellow grade never below this absolute count on darwin (plan floor). */
export const DARWIN_YELLOW_FLOOR = 4_096

export const GRADE_GREEN_MAX = 0.25
export const GRADE_YELLOW_MAX = 0.75

export type WatchFolderRiskGrade = 'green' | 'yellow' | 'red'

export type WatchFolderRiskAssessment = {
  path: string
  fileCount: number
  dirCount: number
  limit: number
  ratio: number
  grade: WatchFolderRiskGrade
  usePolling: boolean
  diskKind: 'ssd' | 'hdd' | 'unknown'
  hddFactorApplied: boolean
  /** Fail-open: assess errors still allow watching. */
  failedOpen: boolean
  error?: string
}

export type AssessWatchFolderInput = {
  path: string
  excludedPaths?: string[] | null
}

function platformNativeLimit(platform: string = process.platform): number {
  return PLATFORM_LIMIT_NATIVE[platform] ?? PLATFORM_LIMIT_NATIVE.linux
}

export function resolveWatchLimit(options: {
  platform?: string
  usePolling: boolean
  diskKind: 'ssd' | 'hdd' | 'unknown'
}): number {
  const platform = options.platform ?? process.platform
  let limit = options.usePolling
    ? PLATFORM_LIMIT_POLLING
    : platformNativeLimit(platform)

  if (options.diskKind === 'hdd') {
    limit = Math.max(1, Math.floor(limit * 0.5))
  }

  return limit
}

/**
 * Grade using absolute count + limit. Darwin yellow floor: ≥4096 cannot be green.
 */
export function gradeWatchFolderRisk(
  fileCount: number,
  limit: number,
  platform: string = process.platform,
): {ratio: number; grade: WatchFolderRiskGrade} {
  const safeLimit = Math.max(1, limit)
  const ratio = fileCount / safeLimit

  if (platform === 'darwin' && fileCount >= DARWIN_YELLOW_FLOOR && ratio < GRADE_GREEN_MAX) {
    return {ratio, grade: 'yellow'}
  }

  if (ratio < GRADE_GREEN_MAX) return {ratio, grade: 'green'}
  if (ratio < GRADE_YELLOW_MAX) return {ratio, grade: 'yellow'}
  return {ratio, grade: 'red'}
}

export async function countFilesUnderFolder(
  rootPath: string,
  excludedPaths: string[] = [],
): Promise<{fileCount: number; dirCount: number}> {
  const root = normalizeMediaPath(rootPath) || rootPath
  const excluded = excludedPaths.map((item) => normalizeMediaPath(item)).filter(Boolean)

  let fileCount = 0
  let dirCount = 0
  const queue = [root]

  while (queue.length) {
    const current = queue.pop()!
    if (isPathUnderExcluded(current, excluded) && current !== root) {
      continue
    }

    let entries: fs.Dirent[]
    try {
      entries = await readdir(current, {withFileTypes: true})
    } catch {
      continue
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = path.join(current, entry.name)
      if (isPathUnderExcluded(full, excluded)) continue

      if (entry.isDirectory()) {
        dirCount += 1
        queue.push(full)
      } else if (entry.isFile()) {
        fileCount += 1
      }
    }
  }

  return {fileCount, dirCount}
}

/** Best-effort rotational disk detection; unknown → treat as SSD (no penalty). */
export async function detectDiskKind(folderPath: string): Promise<'ssd' | 'hdd' | 'unknown'> {
  try {
    if (process.platform === 'darwin') {
      // diskutil info on the volume containing the path
      const {stdout} = await execFileAsync('diskutil', ['info', folderPath], {
        timeout: 8_000,
        maxBuffer: 2 * 1024 * 1024,
      })
      const text = String(stdout)
      if (/Solid\s+State:\s+Yes/i.test(text) || /Media\s+Type:\s*SSD/i.test(text)) {
        return 'ssd'
      }
      if (/Solid\s+State:\s+No/i.test(text) || /Rotational/i.test(text)) {
        return 'hdd'
      }
      return 'unknown'
    }

    if (process.platform === 'linux') {
      // Resolve mount device → /sys/block/*/queue/rotational
      return 'unknown'
    }

    return 'unknown'
  } catch {
    return 'unknown'
  }
}

export async function assessWatchFolderRisk(
  input: AssessWatchFolderInput,
): Promise<WatchFolderRiskAssessment> {
  const folderPath = normalizeMediaPath(String(input.path || '')) || String(input.path || '')
  const excluded = (input.excludedPaths || [])
    .map((item) => normalizeMediaPath(String(item || '')))
    .filter(Boolean)

  if (!folderPath) {
    return {
      path: folderPath,
      fileCount: 0,
      dirCount: 0,
      limit: platformNativeLimit(),
      ratio: 0,
      grade: 'green',
      usePolling: false,
      diskKind: 'unknown',
      hddFactorApplied: false,
      failedOpen: true,
      error: 'empty path',
    }
  }

  if (!fs.existsSync(folderPath)) {
    return {
      path: folderPath,
      fileCount: 0,
      dirCount: 0,
      limit: platformNativeLimit(),
      ratio: 0,
      grade: 'green',
      usePolling: needsPollingForPath(folderPath),
      diskKind: 'unknown',
      hddFactorApplied: false,
      failedOpen: true,
      error: 'path does not exist',
    }
  }

  try {
    const usePolling = needsPollingForPath(folderPath)
    const diskKind = await detectDiskKind(folderPath)
    const limit = resolveWatchLimit({usePolling, diskKind})
    const {fileCount, dirCount} = await countFilesUnderFolder(folderPath, excluded)
    const {ratio, grade} = gradeWatchFolderRisk(fileCount, limit)

    return {
      path: folderPath,
      fileCount,
      dirCount,
      limit,
      ratio,
      grade,
      usePolling,
      diskKind,
      hddFactorApplied: diskKind === 'hdd',
      failedOpen: false,
    }
  } catch (error: unknown) {
    return {
      path: folderPath,
      fileCount: 0,
      dirCount: 0,
      limit: platformNativeLimit(),
      ratio: 0,
      grade: 'green',
      usePolling: needsPollingForPath(folderPath),
      diskKind: 'unknown',
      hddFactorApplied: false,
      failedOpen: true,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
