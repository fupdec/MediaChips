/**
 * @vitest-environment node
 */
import fs from 'node:fs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createTestDb, type TestDb} from '../db/testUtils/createTestDb'

const mocks = vi.hoisted(() => ({
  resolveExistingPath: vi.fn(),
  resolveMediaCreatedAt: vi.fn(),
}))

vi.mock('./contentHash', () => ({resolveExistingPath: mocks.resolveExistingPath}))
vi.mock('./mediaSystemDates', () => ({resolveMediaCreatedAt: mocks.resolveMediaCreatedAt}))

import {
  backfillMediaCreatedAt,
  getMediaCreatedBackfillStatus,
  iterateMediaCreatedBackfill,
  mediaKindFromType,
} from './mediaCreatedBackfill'

let testDb: TestDb
const db = () => testDb as never
const NOW = new Date().toISOString()

function addType(type: string): number {
  const result = testDb.sqlite.prepare(
    `INSERT INTO mediaTypes (type, name, icon, extensions, "order", createdAt, updatedAt) VALUES (?, ?, 'x', 'x', 1, ?, ?)`,
  ).run(type, type, NOW, NOW)
  return Number(result.lastInsertRowid)
}

function addMedia(path: string, mediaTypeId: number, mediaCreatedAt: string | null = null): number {
  const result = testDb.sqlite.prepare(
    `INSERT INTO media (path, basename, name, ext, filesize, mediaTypeId, rating, favorite, views, createdAt, updatedAt, mediaCreatedAt)
     VALUES (?, ?, ?, 'x', 1, ?, 0, 0, 0, ?, ?, ?)`,
  ).run(path, path.split('/').pop(), path, mediaTypeId, NOW, NOW, mediaCreatedAt)
  return Number(result.lastInsertRowid)
}

const createdAt = (id: number) =>
  (testDb.sqlite.prepare('SELECT mediaCreatedAt FROM media WHERE id = ?').get(id) as {mediaCreatedAt: string | null}).mediaCreatedAt

async function collect<T>(iterator: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = []
  for await (const item of iterator) out.push(item)
  return out
}

beforeEach(() => {
  testDb = createTestDb('created-backfill')
  mocks.resolveExistingPath.mockReset()
  mocks.resolveMediaCreatedAt.mockReset()
  mocks.resolveExistingPath.mockImplementation(async (file: string) => (file.includes('gone') ? null : file))
  mocks.resolveMediaCreatedAt.mockImplementation(async (file: string) => (file.includes('unreadable') ? null : '2020-01-01T00:00:00.000Z'))
})

afterEach(() => {
  testDb.sqlite.close()
  fs.rmSync(testDb.dbPath, {force: true})
})

describe('mediaKindFromType', () => {
  it('maps known media types case-insensitively and everything else to "other"', () => {
    expect(mediaKindFromType('Image')).toBe('image')
    expect(mediaKindFromType('VIDEO')).toBe('video')
    expect(mediaKindFromType('audio')).toBe('audio')
    expect(mediaKindFromType('document')).toBe('other')
    expect(mediaKindFromType(null)).toBe('other')
    expect(mediaKindFromType(undefined)).toBe('other')
  })
})

describe('getMediaCreatedBackfillStatus', () => {
  it('counts blank and missing dates as pending', async () => {
    const type = addType('video')
    addMedia('/a.mp4', type, '2021-05-05T00:00:00.000Z')
    addMedia('/b.mp4', type, null)
    addMedia('/c.mp4', type, '   ')
    expect(await getMediaCreatedBackfillStatus(db())).toEqual({total: 3, pending: 2, filled: 1})
  })

  it('reports zeros for an empty library', async () => {
    expect(await getMediaCreatedBackfillStatus(db())).toEqual({total: 0, pending: 0, filled: 0})
  })
})

describe('backfillMediaCreatedAt', () => {
  it('stores the resolved date, passing the right media kind', async () => {
    const id = addMedia('/a.jpg', addType('image'))
    const result = await backfillMediaCreatedAt(db(), {id, path: '/a.jpg', mediaType: 'image'})
    expect(result).toEqual({status: 'updated', id, path: '/a.jpg'})
    expect(createdAt(id)).toBe('2020-01-01T00:00:00.000Z')
    expect(mocks.resolveMediaCreatedAt).toHaveBeenCalledWith('/a.jpg', 'image')
  })

  it('reports missing files without reading dates or touching the row', async () => {
    const id = addMedia('/gone.jpg', addType('image'))
    const result = await backfillMediaCreatedAt(db(), {id, path: '/gone.jpg', mediaType: 'image'})
    expect(result.status).toBe('missing')
    expect(mocks.resolveMediaCreatedAt).not.toHaveBeenCalled()
    expect(createdAt(id)).toBeNull()
  })

  it('reports a failure when no date can be read and leaves the row alone', async () => {
    const id = addMedia('/unreadable.jpg', addType('image'))
    const result = await backfillMediaCreatedAt(db(), {id, path: '/unreadable.jpg', mediaType: null})
    expect(result.status).toBe('failed')
    expect(mocks.resolveMediaCreatedAt).toHaveBeenCalledWith('/unreadable.jpg', 'other')
    expect(createdAt(id)).toBeNull()
  })
})

describe('iterateMediaCreatedBackfill', () => {
  it('walks pending media in id order and ends with a summary', async () => {
    const type = addType('video')
    const done = addMedia('/done.mp4', type, '2019-01-01T00:00:00.000Z')
    const ok = addMedia('/ok.mp4', type)
    const gone = addMedia('/gone.mp4', type)
    const bad = addMedia('/unreadable.mp4', type)

    const events = await collect(iterateMediaCreatedBackfill(db()))
    expect(events[0]).toMatchObject({type: 'progress', processed: 0, total: 3, remaining: 3})
    expect(events.slice(1, -1).map((event) => (event as {lastStatus: string}).lastStatus)).toEqual(['updated', 'missing', 'failed'])
    expect(events[events.length - 1]).toEqual({type: 'complete', processed: 3, total: 3, updated: 1, missing: 1, failed: 1, stopped: false})
    expect(createdAt(ok)).toBe('2020-01-01T00:00:00.000Z')
    expect(createdAt(gone)).toBeNull()
    expect(createdAt(bad)).toBeNull()
    expect(createdAt(done)).toBe('2019-01-01T00:00:00.000Z')
  })

  it('reports shrinking "remaining" and the current path on each step', async () => {
    const type = addType('video')
    addMedia('/a.mp4', type)
    addMedia('/b.mp4', type)
    const events = await collect(iterateMediaCreatedBackfill(db())) as Array<Record<string, unknown>>
    expect(events[1]).toMatchObject({processed: 1, remaining: 1, current: '/a.mp4'})
    expect(events[2]).toMatchObject({processed: 2, remaining: 0, current: '/b.mp4'})
  })

  it('re-processes already filled rows only when forced', async () => {
    const type = addType('video')
    const id = addMedia('/a.mp4', type, '2018-01-01T00:00:00.000Z')
    const normal = await collect(iterateMediaCreatedBackfill(db()))
    expect(normal[normal.length - 1]).toMatchObject({total: 0, processed: 0})
    expect(createdAt(id)).toBe('2018-01-01T00:00:00.000Z')

    const forced = await collect(iterateMediaCreatedBackfill(db(), {force: true}))
    expect(forced[forced.length - 1]).toMatchObject({total: 1, processed: 1, updated: 1})
    expect(createdAt(id)).toBe('2020-01-01T00:00:00.000Z')
  })

  it('stops when asked and says so', async () => {
    const type = addType('video')
    addMedia('/a.mp4', type)
    addMedia('/b.mp4', type)
    addMedia('/c.mp4', type)
    let calls = 0
    const events = await collect(iterateMediaCreatedBackfill(db(), {shouldStop: () => calls++ >= 1}))
    const complete = events[events.length - 1] as Record<string, unknown>
    expect(complete.type).toBe('complete')
    expect(complete.processed).toBe(1)
    expect(complete.stopped).toBe(true)
  })

  it('completes immediately for an empty library', async () => {
    const events = await collect(iterateMediaCreatedBackfill(db()))
    expect(events).toHaveLength(2)
    expect(events[1]).toMatchObject({type: 'complete', processed: 0, total: 0, stopped: false})
  })
})
