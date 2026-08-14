/**
 * @vitest-environment node
 */
import {afterEach, describe, expect, it, vi} from 'vitest'
import type {ApiDb} from '../types/db'
import {createTestDb as createSharedTestDb, closeTestDb} from '../db/testUtils/createTestDb'
import {getHomeSimilar, orderHomeSimilarSeeds} from './homeSimilar'
import {parseHomeSimilarResponse} from '@shared/schemas'

let lastDbPath: string | undefined

function createTestDb(): ApiDb {
  const {sqlite, drizzle, dbPath} = createSharedTestDb('home-similar')
  lastDbPath = dbPath
  return {sqlite, drizzle, path: dbPath} as ApiDb
}

function insertMedia(
  db: ApiDb,
  row: {
    id: number
    name?: string
    viewedAt?: string | null
    favorite?: number
  },
) {
  const name = row.name || `m${row.id}`
  db.sqlite.prepare(`
    INSERT INTO media (
      id, path, name, basename, ext, mediaTypeId, favorite, views, viewedAt,
      filesize, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, 'mp4', 1, ?, 0, ?, 1000, '2026-01-01', '2026-01-01')
  `).run(
    row.id,
    `/v/${row.id}.mp4`,
    name,
    `${name}.mp4`,
    row.favorite ?? 0,
    row.viewedAt ?? null,
  )
}

function linkTag(db: ApiDb, mediaId: number, tagId: number, metaId = 1) {
  db.sqlite.prepare(`
    INSERT INTO tagsInMedia (mediaId, tagId, metaId) VALUES (?, ?, ?)
  `).run(mediaId, tagId, metaId)
}

function setContinue(db: ApiDb, mediaId: number, time = 30, duration = 120) {
  db.sqlite.prepare(`
    INSERT INTO videoMetadata (mediaId, duration, time, width, height)
    VALUES (?, ?, ?, 1920, 1080)
  `).run(mediaId, duration, time)
}

describe('orderHomeSimilarSeeds', () => {
  it('fills early slots from viewed with the configured bias', () => {
    const viewed = [1, 2, 3, 4].map((id) => ({id, reason: 'viewed' as const}))
    const randomPool = [10, 11, 12, 13, 14, 15].map((id) => ({id, reason: 'any' as const}))
    // random() always 0 → shuffle is a deterministic rotate; bias 0.5 of 8 → 4 viewed first
    const ordered = orderHomeSimilarSeeds(viewed, randomPool, {
      limit: 8,
      viewedBias: 0.5,
      random: () => 0,
    })
    expect(ordered.slice(0, 4).every((seed) => seed.reason === 'viewed')).toBe(true)
    expect(ordered.length).toBe(8)
    expect(new Set(ordered.map((seed) => seed.id)).size).toBe(8)
  })
})

describe('getHomeSimilar', () => {
  let db: ApiDb

  afterEach(() => {
    if (db?.sqlite && lastDbPath) closeTestDb({sqlite: db.sqlite, dbPath: lastDbPath})
    vi.restoreAllMocks()
  })

  it('returns empty when the library has no CLIP and no tags', async () => {
    db = createTestDb()
    insertMedia(db, {id: 1})
    const result = await getHomeSimilar(db, {limit: 6, random: () => 0})
    expect(result).toEqual({seed: null, seedItem: null, items: []})
  })

  it('builds tag-based neighbors with seedItem + similarity schema', async () => {
    db = createTestDb()
    insertMedia(db, {id: 1, name: 'seed', viewedAt: '2026-08-01'})
    linkTag(db, 1, 1)
    linkTag(db, 1, 2)

    insertMedia(db, {id: 2, name: 'close'})
    linkTag(db, 2, 1)
    linkTag(db, 2, 2)

    insertMedia(db, {id: 3, name: 'partial'})
    linkTag(db, 3, 1)

    insertMedia(db, {id: 4, name: 'other'})
    linkTag(db, 4, 99)

    const result = await getHomeSimilar(db, {limit: 6, random: () => 0})
    expect(result.seed?.id).toBe(1)
    expect(result.seedItem?.isSeed).toBe(true)
    expect(result.items.length).toBeGreaterThan(0)
    expect(result.items.map((item) => item.id)).toContain(2)
    expect(result.items.map((item) => item.id)).not.toContain(4)

    const parsed = parseHomeSimilarResponse(result)
    expect(parsed.items[0].similarity?.score).toBeGreaterThan(0)
    expect(parsed.items[0].similarity?.signals?.tags).toBeGreaterThan(0)
    expect(parsed.seedItem?.isSeed).toBe(true)
    expect(parsed.items[0].similarity?.signals?.tags).toBeTypeOf('number')
  })

  it('excludes Continue-watching ids from neighbors', async () => {
    db = createTestDb()
    insertMedia(db, {id: 1, name: 'seed', viewedAt: '2026-08-10'})
    linkTag(db, 1, 1)
    linkTag(db, 1, 2)

    // Strong tag match — but also in Continue (time > 0)
    insertMedia(db, {id: 2, name: 'continue-hit', viewedAt: '2026-08-09'})
    linkTag(db, 2, 1)
    linkTag(db, 2, 2)
    setContinue(db, 2)

    insertMedia(db, {id: 3, name: 'ok-neighbor'})
    linkTag(db, 3, 1)
    linkTag(db, 3, 2)

    const result = await getHomeSimilar(db, {limit: 6, random: () => 0})
    expect(result.seed?.id).toBe(1)
    expect(result.items.map((item) => item.id)).toContain(3)
    expect(result.items.map((item) => item.id)).not.toContain(2)
  })
})
