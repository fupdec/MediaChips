/**
 * @vitest-environment node
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import Database from 'better-sqlite3'
import {drizzle} from 'drizzle-orm/better-sqlite3'
import type {ApiDb} from '../types/db'
import {applySqlitePragmas} from '../db/pragmas'
import * as schema from '../db/schema'
import {loadMarkItems} from './markItemsLoader'
import {
  buildMarkOrderSql,
  buildMarkSearchSql,
  buildMarkTypeSql,
  countMarksFiltered,
  queryMarkPageIds,
} from './markItemsSql'

function createMarksTestDb(): ApiDb {
  const sqlite = new Database(':memory:')
  applySqlitePragmas(sqlite)
  sqlite.exec(`
    CREATE TABLE media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      basename TEXT,
      name TEXT,
      ext TEXT,
      filesize INTEGER DEFAULT 0,
      contentHash TEXT,
      oshash TEXT,
      visualHash TEXT,
      visualHashTiles TEXT,
      rating INTEGER DEFAULT 0,
      favorite INTEGER DEFAULT 0,
      bookmark TEXT,
      views INTEGER DEFAULT 0,
      oldId TEXT,
      viewedAt TEXT,
      mediaTypeId INTEGER,
      deletedAt TEXT,
      trashOriginalPath TEXT,
      trashPurgeFile INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT '2024-01-01',
      updatedAt TEXT NOT NULL DEFAULT '2024-01-01'
    );
    CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      oldId TEXT,
      name TEXT NOT NULL,
      synonyms TEXT,
      rating INTEGER DEFAULT 0 NOT NULL,
      favorite INTEGER DEFAULT 0 NOT NULL,
      bookmark TEXT,
      country TEXT,
      color TEXT,
      views INTEGER DEFAULT 0,
      viewedAt TEXT,
      metaId INTEGER,
      deletedAt TEXT,
      trashOriginalName TEXT,
      createdAt TEXT NOT NULL DEFAULT '2024-01-01',
      updatedAt TEXT NOT NULL DEFAULT '2024-01-01'
    );
    CREATE TABLE meta (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      name TEXT,
      icon TEXT,
      hint TEXT,
      "order" INTEGER,
      views INTEGER DEFAULT 0,
      oldId TEXT,
      synonyms INTEGER DEFAULT 0,
      hidden INTEGER DEFAULT 0,
      nested INTEGER DEFAULT 0,
      marks INTEGER DEFAULT 0,
      bookmark INTEGER DEFAULT 0,
      parser INTEGER DEFAULT 0,
      pathRegex TEXT,
      pathRegexReplace TEXT,
      pathRegexCreateTags INTEGER DEFAULT 1,
      pathRegexEnabled INTEGER DEFAULT 0,
      country INTEGER DEFAULT 0,
      career INTEGER DEFAULT 0,
      scraper INTEGER DEFAULT 0,
      rating INTEGER DEFAULT 0,
      favorite INTEGER DEFAULT 1,
      chipVariant TEXT,
      chipLabel INTEGER DEFAULT 0,
      color INTEGER DEFAULT 0,
      autoColorFromImage INTEGER DEFAULT 0,
      imageAspectRatio REAL DEFAULT 1,
      tagPageDesign TEXT,
      measurementUnit TEXT,
      isLink INTEGER DEFAULT 0,
      ratingIcon TEXT,
      ratingIconEmpty TEXT,
      ratingIconHalf TEXT,
      ratingMax INTEGER DEFAULT 5,
      ratingColor TEXT,
      ratingHalf INTEGER DEFAULT 0,
      sortBy TEXT,
      sortDir TEXT,
      createdAt TEXT NOT NULL DEFAULT '2024-01-01',
      updatedAt TEXT NOT NULL DEFAULT '2024-01-01'
    );
    CREATE TABLE marks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      text TEXT,
      time INTEGER,
      end INTEGER,
      tagId INTEGER,
      mediaId INTEGER,
      icon TEXT,
      deletedAt TEXT
    );

    INSERT INTO media (id, path, name, basename) VALUES
      (1, '/a.mp4', 'Alpha Video', 'a.mp4'),
      (2, '/b.mp4', 'Beta Clip', 'b.mp4');
    INSERT INTO meta (id, name) VALUES (10, 'People');
    INSERT INTO tags (id, name, metaId) VALUES
      (100, 'Ada', 10),
      (101, 'Bob', 10);
    INSERT INTO marks (id, type, text, time, tagId, mediaId) VALUES
      (1, 'favorite', 'fav note', 30, NULL, 1),
      (2, 'bookmark', 'book note', 10, NULL, 2),
      (3, 'meta', NULL, 20, 100, 1),
      (4, 'meta', 'other', 40, 101, 2);
  `)

  return {
    sqlite,
    drizzle: drizzle(sqlite, {schema}),
  } as ApiDb
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
      db.sqlite.close()
    }
  })
})

describe('loadMarkItems', () => {
  let db: ApiDb

  beforeEach(() => {
    db = createMarksTestDb()
  })

  afterEach(() => {
    db.sqlite.close()
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
