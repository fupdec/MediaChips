/**
 * @vitest-environment node
 */
import {afterEach, describe, expect, it} from 'vitest'
import {createTestDb as createSharedTestDb, closeTestDb} from '../db/testUtils/createTestDb'
import type {ApiDb} from '../types/db'
import {findSimilarByTags, loadMediaTagIds} from './mediaTagSimilarity'

let lastDbPath: string | undefined

function createTestDb(): ApiDb {
  const {sqlite, drizzle, dbPath} = createSharedTestDb('media-tag-similarity')
  lastDbPath = dbPath
  return {sqlite, drizzle, path: dbPath} as ApiDb
}

function insertMedia(db: ApiDb, id: number, name = `m${id}`) {
  db.sqlite.prepare(`
    INSERT INTO media (id, path, name, basename, mediaTypeId, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, 1, '2026-01-01', '2026-01-01')
  `).run(id, `/v/${id}.mp4`, name, name)
}

function linkTag(db: ApiDb, mediaId: number, tagId: number, metaId = 1) {
  db.sqlite.prepare(`
    INSERT INTO tagsInMedia (mediaId, tagId, metaId) VALUES (?, ?, ?)
  `).run(mediaId, tagId, metaId)
}

describe('findSimilarByTags', () => {
  let db: ApiDb

  afterEach(() => {
    if (db?.sqlite && lastDbPath) closeTestDb({sqlite: db.sqlite, dbPath: lastDbPath})
  })

  it('returns empty when seed has no tags', () => {
    db = createTestDb()
    insertMedia(db, 1)
    const result = findSimilarByTags(db, 1, {limit: 6})
    expect(result.hasTags).toBe(false)
    expect(result.ids).toEqual([])
  })

  it('ranks neighbors by Jaccard tag overlap', () => {
    db = createTestDb()
    // seed: tags 1,2,3
    insertMedia(db, 1, 'seed')
    linkTag(db, 1, 1)
    linkTag(db, 1, 2)
    linkTag(db, 1, 3)

    // perfect overlap
    insertMedia(db, 2, 'exact')
    linkTag(db, 2, 1)
    linkTag(db, 2, 2)
    linkTag(db, 2, 3)

    // 2 of 3 shared, extra noise tags
    insertMedia(db, 3, 'partial')
    linkTag(db, 3, 1)
    linkTag(db, 3, 2)
    linkTag(db, 3, 9)
    linkTag(db, 3, 10)

    // single shared
    insertMedia(db, 4, 'weak')
    linkTag(db, 4, 3)
    linkTag(db, 4, 11)

    // unrelated
    insertMedia(db, 5, 'other')
    linkTag(db, 5, 99)

    expect(loadMediaTagIds(db, 1)).toEqual([1, 2, 3])

    const result = findSimilarByTags(db, 1, {limit: 10})
    expect(result.hasTags).toBe(true)
    expect(result.seedTagCount).toBe(3)
    expect(result.ids).toEqual([2, 3, 4])
    expect(result.hits[0].score).toBe(1)
    expect(result.hits[0].sharedCount).toBe(3)
    expect(result.hits[1].sharedCount).toBe(2)
    expect(result.hits[2].sharedCount).toBe(1)
  })
})
