/**
 * Progressive MP4 remux cache for container_layout files.
 * One-shot `-c copy -movflags +faststart` → seekable file shared by player/hover.
 */

import fs from 'fs'
import {
  ensureCacheDir,
  getCachePaths,
  resolveExistingCache,
  trimCacheToLimit,
  writeCacheMeta,
} from './transcodeCache'
import {runFfmpeg} from '../../utils/ffmpeg'

const runningJobs = new Map<string, Promise<string | null>>()

export type RemuxCacheLookup = {
  cacheKey: string
  outputPath: string
  ready: boolean
}

export function lookupRemuxCache(
  databasesPath: string,
  dbId: string,
  filePath: string,
): RemuxCacheLookup | null {
  const info = resolveExistingCache(databasesPath, dbId, filePath)
  if (!info) return null
  const ready = !info.pending && fs.existsSync(info.outputPath)
  return {
    cacheKey: info.cacheKey,
    outputPath: info.outputPath,
    ready,
  }
}

async function runProgressiveRemuxJob(input: {
  databasesPath: string
  dbId: string
  filePath: string
  cacheKey: string
  outputPath: string
  metaPath: string
  tempPath: string
  sourceMtime: number
  sourceSize: number
  maxCacheGb: number
}): Promise<string | null> {
  const {
    databasesPath,
    dbId,
    filePath,
    cacheKey,
    outputPath,
    metaPath,
    tempPath,
    sourceMtime,
    sourceSize,
    maxCacheGb,
  } = input

  ensureCacheDir(getCachePaths(databasesPath, dbId, cacheKey).cacheDir)

  const baseMeta = {
    cacheKey,
    sourcePath: filePath,
    sourceMtime,
    sourceSize,
    outputPath,
    kind: 'progressive_remux',
    createdAt: Date.now(),
  }

  writeCacheMeta(metaPath, {
    ...baseMeta,
    status: 'running',
    progress: 0,
    error: null,
    updatedAt: Date.now(),
  })

  try {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)

    await runFfmpeg([
      '-y',
      '-i',
      filePath,
      '-map',
      '0',
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      tempPath,
    ])

    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
    fs.renameSync(tempPath, outputPath)

    writeCacheMeta(metaPath, {
      ...baseMeta,
      status: 'done',
      progress: 100,
      error: null,
      updatedAt: Date.now(),
    })

    trimCacheToLimit(databasesPath, dbId, maxCacheGb)
    return outputPath
  } catch (error: unknown) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
    } catch {
      // ignore cleanup errors
    }

    writeCacheMeta(metaPath, {
      ...baseMeta,
      status: 'error',
      progress: 0,
      error: error instanceof Error ? error.message : String(error),
      updatedAt: Date.now(),
    })
    return null
  }
}

/**
 * Ensure a progressive remux exists (or is being built). Returns the output
 * path when already done; otherwise schedules work and returns null.
 */
export function ensureProgressiveRemux(input: {
  databasesPath: string
  dbId: string
  filePath: string
  maxCacheGb?: number
}): string | null {
  const {databasesPath, dbId, filePath} = input
  const maxCacheGb = Number(input.maxCacheGb)
  const limitGb = Number.isFinite(maxCacheGb) && maxCacheGb > 0 ? maxCacheGb : 2

  const info = resolveExistingCache(databasesPath, dbId, filePath)
  if (!info) return null

  const {cacheKey, outputPath, metaPath, stat} = info
  const {tempPath} = getCachePaths(databasesPath, dbId, cacheKey)

  if (!info.pending && fs.existsSync(outputPath)) {
    return outputPath
  }

  // Don't retry a hard failure until the source key changes (mtime/size).
  if (info.meta?.status === 'error' && info.meta?.kind === 'progressive_remux') {
    return null
  }

  if (!runningJobs.has(cacheKey)) {
    const job = runProgressiveRemuxJob({
      databasesPath,
      dbId,
      filePath,
      cacheKey,
      outputPath,
      metaPath,
      tempPath,
      sourceMtime: Number(stat.mtimeMs),
      sourceSize: Number(stat.size),
      maxCacheGb: limitGb,
    }).finally(() => {
      runningJobs.delete(cacheKey)
    })
    runningJobs.set(cacheKey, job)
  }

  return null
}

/** Test helper — wait for an in-flight remux job. */
export function waitForRemuxJob(cacheKey: string): Promise<string | null> | null {
  return runningJobs.get(cacheKey) || null
}

export function clearRemuxJobRegistryForTests(): void {
  runningJobs.clear()
}
