// @vitest-environment node
import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {getCacheDir, trimCacheToLimit, writeCacheMeta} from './transcodeCache'

describe('transcode disk budget', () => {
  let root: string
  let cache: string
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-cache-budget-'))
    cache = getCacheDir(root, 'db')
    fs.mkdirSync(cache, {recursive: true})
  })
  afterEach(() => fs.rmSync(root, {recursive: true, force: true}))
  const put = (name: string, value: string | Buffer) => fs.writeFileSync(path.join(cache, name), value)
  it('counts orphan outputs and removes the oldest group before a newer usable entry', () => {
    put('orphan.mp4', Buffer.alloc(500))
    fs.utimesSync(path.join(cache, 'orphan.mp4'), new Date(0), new Date(0))
    put('new.mp4', Buffer.alloc(300))
    put('new.json', JSON.stringify({cacheKey: 'new', status: 'done'}))
    const result = trimCacheToLimit(root, 'db', 400 / 1024 ** 3)
    expect(result.bytes).toBeLessThanOrEqual(400)
    expect(fs.existsSync(path.join(cache, 'orphan.mp4'))).toBe(false)
    expect(fs.existsSync(path.join(cache, 'new.mp4'))).toBe(true)
  })
  it('cleans a failed partial output without deleting an active writer', () => {
    put('failed.part.mp4', Buffer.alloc(500))
    put('failed.json', JSON.stringify({status: 'error'}))
    put('active.part.mp4', Buffer.alloc(100))
    writeCacheMeta(path.join(cache, 'active.json'), {status: 'running'})
    const result = trimCacheToLimit(root, 'db', 200 / 1024 ** 3)
    expect(result.bytes).toBeLessThanOrEqual(200)
    expect(fs.existsSync(path.join(cache, 'failed.part.mp4'))).toBe(false)
    expect(fs.existsSync(path.join(cache, 'failed.json'))).toBe(false)
    expect(fs.existsSync(path.join(cache, 'active.part.mp4'))).toBe(true)
  })
  it('reclaims partial output left marked as running by a previous process', () => {
    put('abandoned.part.mp4', Buffer.alloc(500))
    put('abandoned.json', JSON.stringify({status: 'running'}))
    expect(trimCacheToLimit(root, 'db', 100 / 1024 ** 3).bytes).toBe(0)
  })

})
