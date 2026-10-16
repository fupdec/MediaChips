import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  clearCache,
  clearCacheExcept,
  getCacheStats,
  getCacheDir,
  trimCacheToLimit,
} from '../../api/services/transcode/transcodeCache'

describe('transcodeCache single-video policy', () => {
  let rootDir: string
  let databasesPath: string
  const dbId = 'test-db'

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-transcode-cache-'))
    databasesPath = path.join(rootDir, 'databases')
    const cacheDir = getCacheDir(databasesPath, dbId)
    fs.mkdirSync(cacheDir, {recursive: true})

    fs.writeFileSync(path.join(cacheDir, 'aaa.json'), '{}')
    fs.writeFileSync(path.join(cacheDir, 'aaa.mp4'), Buffer.alloc(100))
    fs.writeFileSync(path.join(cacheDir, 'bbb.json'), '{}')
    fs.writeFileSync(path.join(cacheDir, 'bbb.mp4'), Buffer.alloc(200))
  })

  afterEach(() => {
    fs.rmSync(rootDir, {recursive: true, force: true})
  })

  it('reports total cache size', () => {
    expect(getCacheStats(databasesPath, dbId)).toEqual({
      bytes: 304,
      files: 4,
      entries: 0,
    })
  })

  it('keeps only the current video cache entry', () => {
    const removed = clearCacheExcept(databasesPath, dbId, 'bbb')
    expect(removed).toBe(2)
    expect(getCacheStats(databasesPath, dbId)).toEqual({
      bytes: 202,
      files: 2,
      entries: 0,
    })
  })

  it('clears cache and returns freed bytes', () => {
    expect(clearCache(databasesPath, dbId)).toEqual({
      removed: 4,
      bytes: 304,
    })
    expect(getCacheStats(databasesPath, dbId)).toEqual({
      bytes: 0,
      files: 0,
      entries: 0,
    })
  })

  it('trims oldest cache entries when over the configured limit', () => {
    const cacheDir = getCacheDir(databasesPath, dbId)
    fs.writeFileSync(path.join(cacheDir, 'aaa.json'), JSON.stringify({
      cacheKey: 'aaa',
      status: 'done',
      createdAt: 1,
      updatedAt: 1,
    }))
    fs.writeFileSync(path.join(cacheDir, 'bbb.json'), JSON.stringify({
      cacheKey: 'bbb',
      status: 'done',
      createdAt: 2,
      updatedAt: 2,
    }))

    const maxGb = 350 / (1024 * 1024 * 1024)
    trimCacheToLimit(databasesPath, dbId, maxGb)

    expect(fs.existsSync(path.join(cacheDir, 'aaa.mp4'))).toBe(false)
    expect(fs.existsSync(path.join(cacheDir, 'bbb.mp4'))).toBe(true)
  })
})
