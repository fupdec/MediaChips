/**
 * @vitest-environment node
 */
import {afterEach, describe, expect, it, vi} from 'vitest'
import type {ApiDb} from '../types/db'
import {createTestDb as createSharedTestDb, closeTestDb} from '../db/testUtils/createTestDb'
import {getHomeSimilar, orderHomeSimilarSeeds} from './homeSimilar'
import {parseHomeSimilarResponse} from '@shared/schemas'
import {CLIP_EMBEDDING_INDEX_KEY} from './clipEmbeddingModel'
import {l2Normalize, packFloat32Embeddings, type ClipEmbeddingVector} from './clipEmbeddingMath'

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

function insertClipEmbedding(db: ApiDb, mediaId: number, vectors: ClipEmbeddingVector[]) {
  const embedding = packFloat32Embeddings(vectors)
  db.sqlite.prepare(`
    INSERT INTO mediaClipEmbeddings (mediaId, embedding, dims, model, updatedAt)
    VALUES (?, ?, ?, ?, '2026-01-01')
  `).run(mediaId, embedding, vectors[0].length, CLIP_EMBEDDING_INDEX_KEY)
}

describe('orderHomeSimilarSeeds', () => {
  it('fills early slots from viewed when rng stays below the bias', () => {
    const viewed = [1, 2, 3, 4].map((id) => ({id, reason: 'viewed' as const}))
    const randomPool = [10, 11, 12, 13, 14, 15].map((id) => ({id, reason: 'any' as const}))
    // random() always 0 → shuffle is a deterministic rotate; 0 < 0.5 → viewed first
    const ordered = orderHomeSimilarSeeds(viewed, randomPool, {
      limit: 8,
      viewedBias: 0.5,
      random: () => 0,
    })
    expect(ordered.slice(0, 4).every((seed) => seed.reason === 'viewed')).toBe(true)
    expect(ordered.length).toBe(8)
    expect(new Set(ordered.map((seed) => seed.id)).size).toBe(8)
  })

  it('draws first attempts from the random pool when rng is above the bias', () => {
    const viewed = [1, 2, 3, 4].map((id) => ({id, reason: 'viewed' as const}))
    const randomPool = [10, 11, 12, 13, 14, 15].map((id) => ({id, reason: 'any' as const}))
    // 0.99 → identity shuffle and 0.99 < 0.4 is false, so random pool first
    const ordered = orderHomeSimilarSeeds(viewed, randomPool, {
      limit: 8,
      viewedBias: 0.4,
      random: () => 0.99,
    })
    expect(ordered.slice(0, 4).every((seed) => seed.reason === 'any')).toBe(true)
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

  it('attaches the matching CLIP grid tile for scene-similar neighbors', async () => {
    db = createTestDb()
    insertMedia(db, {id: 1, name: 'seed', viewedAt: '2026-08-01'})
    insertMedia(db, {id: 2, name: 'grid-match'})
    insertMedia(db, {id: 3, name: 'thumb-only'})

    const unique = (salt: number, index: number) => l2Normalize([0, salt, index + 1])
    const scene = l2Normalize([1, 0, 0])
    const grid = (salt: number, matchIndex: number) => Array.from({length: 9}, (_, index) => (
      index === matchIndex ? scene : unique(salt, index)
    ))

    insertClipEmbedding(db, 1, grid(1, 2))
    insertClipEmbedding(db, 2, grid(2, 7))
    insertClipEmbedding(db, 3, [scene])

    const result = await getHomeSimilar(db, {limit: 6, random: () => 0})
    expect(result.seed?.id).toBe(1)

    const gridMatch = result.items.find((item) => Number(item.id) === 2)
    expect(gridMatch?.semanticTileIndex).toBe(7)
    expect((gridMatch?.similarity as {tileIndex?: number} | undefined)?.tileIndex).toBe(7)
    expect((gridMatch?.similarity as {signals?: {clip?: number}} | undefined)?.signals?.clip).toBeGreaterThan(0.9)

    const thumbOnly = result.items.find((item) => Number(item.id) === 3)
    expect(thumbOnly?.semanticTileIndex).toBeUndefined()
    expect((thumbOnly?.similarity as {tileIndex?: number} | undefined)?.tileIndex).toBeUndefined()

    const parsed = parseHomeSimilarResponse(result)
    expect(parsed.items.find((item) => item.id === 2)?.similarity?.tileIndex).toBe(7)
  })

  it('skips an excluded seed so reshuffle can pick a different original', async () => {
    db = createTestDb()
    insertMedia(db, {id: 1, name: 'old-seed', viewedAt: '2026-08-10'})
    linkTag(db, 1, 1)
    linkTag(db, 1, 2)

    insertMedia(db, {id: 2, name: 'old-neighbor'})
    linkTag(db, 2, 1)
    linkTag(db, 2, 2)

    insertMedia(db, {id: 10, name: 'next-seed'})
    linkTag(db, 10, 3)
    linkTag(db, 10, 4)

    insertMedia(db, {id: 11, name: 'next-neighbor'})
    linkTag(db, 11, 3)
    linkTag(db, 11, 4)

    const result = await getHomeSimilar(db, {limit: 6, random: () => 0, excludeSeedId: 1})
    expect(result.seed?.id).not.toBe(1)
    expect(result.items.map((item) => item.id)).not.toContain(1)
    expect(result.seed?.id).toBeTruthy()
  })
})
