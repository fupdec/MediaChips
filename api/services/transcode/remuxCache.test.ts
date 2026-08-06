/**
 * @vitest-environment node
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('../../utils/ffmpeg', () => ({
  runFfmpegBackground: vi.fn(async (args: string[]) => {
    const output = args[args.length - 1]
    fs.writeFileSync(output, Buffer.from('remuxed'))
  }),
}))

import {runFfmpegBackground} from '../../utils/ffmpeg'
import {
  clearRemuxJobRegistryForTests,
  ensureProgressiveRemux,
  lookupRemuxCache,
  waitForRemuxJob,
} from './remuxCache'
import {getCacheDir, resolveExistingCache} from './transcodeCache'

describe('remuxCache', () => {
  let rootDir: string
  let databasesPath: string
  const dbId = 'test-db'
  let sourcePath: string

  beforeEach(() => {
    clearRemuxJobRegistryForTests()
    vi.mocked(runFfmpegBackground).mockClear()
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-remux-cache-'))
    databasesPath = path.join(rootDir, 'databases')
    sourcePath = path.join(rootDir, 'source.mp4')
    fs.writeFileSync(sourcePath, Buffer.from('source-bytes'))
  })

  afterEach(() => {
    clearRemuxJobRegistryForTests()
    fs.rmSync(rootDir, {recursive: true, force: true})
  })

  it('schedules a progressive remux and marks cache ready', async () => {
    expect(lookupRemuxCache(databasesPath, dbId, sourcePath)?.ready).toBe(false)

    const immediate = ensureProgressiveRemux({
      databasesPath,
      dbId,
      filePath: sourcePath,
      maxCacheGb: 1,
    })
    expect(immediate).toBeNull()

    const info = resolveExistingCache(databasesPath, dbId, sourcePath)
    expect(info?.cacheKey).toBeTruthy()
    const donePath = await waitForRemuxJob(info!.cacheKey)
    expect(donePath).toBeTruthy()
    expect(fs.existsSync(donePath!)).toBe(true)
    expect(lookupRemuxCache(databasesPath, dbId, sourcePath)?.ready).toBe(true)

    expect(runFfmpegBackground).toHaveBeenCalledTimes(1)
    const args = vi.mocked(runFfmpegBackground).mock.calls[0][0]
    expect(args).toContain('-c')
    expect(args).toContain('copy')
    expect(args).toContain('+faststart')
  })

  it('returns the existing output when remux is already done', async () => {
    ensureProgressiveRemux({databasesPath, dbId, filePath: sourcePath, maxCacheGb: 1})
    const info = resolveExistingCache(databasesPath, dbId, sourcePath)
    await waitForRemuxJob(info!.cacheKey)

    const readyPath = ensureProgressiveRemux({
      databasesPath,
      dbId,
      filePath: sourcePath,
      maxCacheGb: 1,
    })
    expect(readyPath).toBe(info!.outputPath)
    expect(runFfmpegBackground).toHaveBeenCalledTimes(1)
  })

  it('dedupes concurrent ensure calls for the same source', async () => {
    ensureProgressiveRemux({databasesPath, dbId, filePath: sourcePath, maxCacheGb: 1})
    ensureProgressiveRemux({databasesPath, dbId, filePath: sourcePath, maxCacheGb: 1})
    const info = resolveExistingCache(databasesPath, dbId, sourcePath)
    await waitForRemuxJob(info!.cacheKey)
    expect(runFfmpegBackground).toHaveBeenCalledTimes(1)
    expect(fs.existsSync(getCacheDir(databasesPath, dbId))).toBe(true)
  })
})
