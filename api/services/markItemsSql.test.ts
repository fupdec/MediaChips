/**
 * @vitest-environment node
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import type {ApiDb} from '../types/db'
import {createTestDb as createSharedTestDb, closeTestDb} from '../db/testUtils/createTestDb'
import {loadMarkItems} from './markItemsLoader'
import {
  buildMarkOrderSql,
  buildMarkSearchSql,
  buildMarkTypeSql,
  countMarksFiltered,
  queryMarkPageIds,
} from './markItemsSql'

function createMarksTestDb(): ApiDb & {dbPath: string} {
  const {sqlite, drizzle, dbPath} = createSharedTestDb('mark-items-sql')
  sqlite.exec(`
    INSERT INTO media (id, path, name, basename, createdAt, updatedAt) VALUES
      (1, '/a.mp4', 'Alpha Video', 'a.mp4', '2024-01-01', '2024-01-01'),
      (2, '/b.mp4', 'Beta Clip', 'b.mp4', '2024-01-01', '2024-01-01');
    INSERT INTO meta (id, name, createdAt, updatedAt) VALUES (10, 'People', '2024-01-01', '2024-01-01');
    INSERT INTO tags (id, name, metaId, createdAt, updatedAt) VALUES
      (100, 'Ada', 10, '2024-01-01', '2024-01-01'),
      (101, 'Bob', 10, '2024-01-01', '2024-01-01');
    INSERT INTO marks (id, type, text, time, tagId, mediaId) VALUES
      (1, 'favorite', 'fav note', 30, NULL, 1),
      (2, 'bookmark', 'book note', 10, NULL, 2),
      (3, 'meta', NULL, 20, 100, 1),
      (4, 'meta', 'other', 40, 101, 2);
  `)

  return {sqlite, drizzle, dbPath} as ApiDb & {dbPath: string}
}

describe('markItemsSql', () => {
  it('builds type/search/order fragments', () => {
    const replacements: Record<string, unknown> = {}
    expect(buildMarkTypeSql([], replacements)).toBe('0 = 1')
    expect(buildMarkTypeSql(['favorite', 10], replacements)).toContain("marks.type = 'favorite'")
    expect(buildMarkTypeSql(['favorite', 10], replacements)).toContain('tags.metaId IN (:markMetaIds)')
    expect(replacements.markMetaIds).toEqual([10])

    expect(buildMarkSearchSql('', {})).toBeNull()
    expect(buildMarkSearchSql('Ada', replacements)).toContain('LIKE :markSearch')
    expect(buildMarkOrderSql('videoName', 'asc')).toContain('media.name')
    expect(buildMarkOrderSql('shuffle', 'desc')).toBe('RANDOM()')
  })

  it('filters, sorts, and pages mark ids in SQL', () => {
    const db = createMarksTestDb()
    try {
      expect(countMarksFiltered(db, {types: []})).toBe(0)
      expect(countMarksFiltered(db, {types: ['favorite', 'bookmark']})).toBe(2)
      expect(countMarksFiltered(db, {types: [10]})).toBe(2)
      expect(countMarksFiltered(db, {types: ['favorite', 10], search: 'alpha'})).toBe(2)

      expect(queryMarkPageIds(db, {
        types: ['favorite', 'bookmark', 10],
        sortBy: 'time',
        sortDir: 'asc',
        limit: 2,
        offset: 0,
      })).toEqual([2, 3])

      expect(queryMarkPageIds(db, {
        types: ['favorite', 'bookmark', 10],
        sortBy: 'time',
        sortDir: 'asc',
        limit: 2,
        offset: 2,
      })).toEqual([1, 4])
    } finally {
      closeTestDb({sqlite: db.sqlite, dbPath: db.dbPath})
    }
  })
})

describe('loadMarkItems', () => {
  let db: ApiDb & {dbPath: string}

  beforeEach(() => {
    db = createMarksTestDb()
  })

  afterEach(() => {
    closeTestDb({sqlite: db.sqlite, dbPath: db.dbPath})
  })

  it('returns a hydrated page without loading every mark', async () => {
    const result = await loadMarkItems(db, {
      types: ['favorite', 'bookmark', 10],
      sortBy: 'time',
      sortDir: 'asc',
      page: 1,
      limit: 2,
    })

    expect(result.total).toBe(4)
    expect(result.totalFiltered).toBe(4)
    expect(result.items).toHaveLength(2)
    expect(result.items.map((item) => item.id)).toEqual([2, 3])
    expect(result.items[0].medium || result.items[0].media).toMatchObject({name: 'Beta Clip'})
    expect(result.items[1].tag).toMatchObject({name: 'Ada', metaId: 10})
  })

  it('applies search against text and related names', async () => {
    const result = await loadMarkItems(db, {
      types: ['favorite', 'bookmark', 10],
      search: 'bob',
      page: 1,
      limit: 10,
    })
    expect(result.totalFiltered).toBe(1)
    expect(result.items[0].id).toBe(4)
  })
})
