/**
 * @vitest-environment node
 */
import {describe, expect, it} from 'vitest'
import Database from 'better-sqlite3'
import {drizzle} from 'drizzle-orm/better-sqlite3'
import {applySqlitePragmas} from '../db/pragmas'
import type {ApiDb} from '../types/db'
import {
  buildTagSpotlightGaps,
  buildTagSpotlightTips,
  getHomeTagSpotlight,
  scoreTagSpotlightCandidate,
} from './homeTagSpotlight'
import {parseHomeTagSpotlight} from '@shared/schemas'

function createTestDb(): ApiDb {
  const sqlite = new Database(':memory:')
  applySqlitePragmas(sqlite)
  sqlite.exec(`
    CREATE TABLE meta (
      id INTEGER PRIMARY KEY,
      type TEXT,
      name TEXT,
      icon TEXT,
      synonyms INTEGER DEFAULT 0,
      bookmark INTEGER DEFAULT 0,
      country INTEGER DEFAULT 0,
      rating INTEGER DEFAULT 0,
      favorite INTEGER DEFAULT 1,
      color INTEGER DEFAULT 0,
      hidden INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE tags (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      synonyms TEXT,
      rating INTEGER DEFAULT 0,
      favorite INTEGER DEFAULT 0,
      bookmark TEXT,
      country TEXT,
      color TEXT,
      views INTEGER DEFAULT 0,
      viewedAt TEXT,
      metaId INTEGER,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE media (
      id INTEGER PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      name TEXT,
      basename TEXT,
      ext TEXT,
      mediaTypeId INTEGER,
      favorite INTEGER DEFAULT 0,
      views INTEGER DEFAULT 0,
      viewedAt TEXT,
      filesize INTEGER DEFAULT 0,
      rating REAL,
      deletedAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE videoMetadata (
      mediaId INTEGER PRIMARY KEY,
      duration REAL,
      time REAL,
      width INTEGER,
      height INTEGER
    );
    CREATE TABLE imageMetadata (
      mediaId INTEGER PRIMARY KEY,
      width INTEGER,
      height INTEGER
    );
    CREATE TABLE tagsInMedia (
      mediaId INTEGER NOT NULL,
      tagId INTEGER NOT NULL,
      metaId INTEGER NOT NULL,
      PRIMARY KEY (mediaId, tagId, metaId)
    );
    CREATE TABLE valuesInTags (
      tagId INTEGER NOT NULL,
      metaId INTEGER NOT NULL,
      value TEXT,
      PRIMARY KEY (tagId, metaId)
    );
    CREATE TABLE tagsInTags (
      parentTagId INTEGER NOT NULL,
      tagId INTEGER NOT NULL,
      metaId INTEGER NOT NULL,
      PRIMARY KEY (parentTagId, tagId, metaId)
    );
    CREATE TABLE pinnedMetas (
      metaId INTEGER NOT NULL,
      pinnedMetaId INTEGER NOT NULL,
      show INTEGER DEFAULT 1,
      "order" INTEGER,
      PRIMARY KEY (metaId, pinnedMetaId)
    );
  `)
  return {
    sqlite,
    drizzle: drizzle(sqlite),
    path: ':memory:',
  } as ApiDb
}

function seedMeta(db: ApiDb, id = 1) {
  db.sqlite.prepare(`
    INSERT INTO meta (
      id, type, name, icon, synonyms, bookmark, country, rating, favorite, color, hidden,
      createdAt, updatedAt
    ) VALUES (?, 'array', 'People', 'account', 1, 1, 1, 1, 1, 0, 0, '2026-01-01', '2026-01-01')
  `).run(id)
}

function seedTag(
  db: ApiDb,
  row: {
    id: number
    name: string
    synonyms?: string | null
    rating?: number
    bookmark?: string | null
    views?: number
    viewedAt?: string | null
    metaId?: number
  },
) {
  db.sqlite.prepare(`
    INSERT INTO tags (
      id, name, synonyms, rating, favorite, bookmark, country, color, views, viewedAt, metaId,
      createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, 0, ?, NULL, NULL, ?, ?, ?, '2026-01-01', '2026-01-01')
  `).run(
    row.id,
    row.name,
    row.synonyms ?? null,
    row.rating ?? 0,
    row.bookmark ?? null,
    row.views ?? 0,
    row.viewedAt ?? null,
    row.metaId ?? 1,
  )
}

describe('homeTagSpotlight', () => {
  it('scores incomplete unused tags higher', () => {
    expect(scoreTagSpotlightCandidate({
      mediaCount: 0,
      views: 0,
      viewedAt: null,
      synonyms: null,
      bookmark: null,
      country: null,
      rating: 0,
      color: null,
      valueCount: 0,
      nestedTagCount: 0,
      pinnedFieldCount: 2,
      metaSynonyms: true,
      metaBookmark: true,
      metaCountry: true,
      metaRating: true,
      metaColor: false,
    })).toBeGreaterThan(scoreTagSpotlightCandidate({
      mediaCount: 5,
      views: 10,
      viewedAt: '2026-01-01',
      synonyms: 'a',
      bookmark: 'https://x',
      country: 'US',
      rating: 4,
      color: null,
      valueCount: 2,
      nestedTagCount: 1,
      pinnedFieldCount: 2,
      metaSynonyms: true,
      metaBookmark: true,
      metaCountry: true,
      metaRating: true,
      metaColor: false,
    }))
  })

  it('builds gaps and tips for empty unused tags', () => {
    const row = {
      id: 1,
      name: 'Alice',
      synonyms: null,
      rating: 0,
      favorite: 0,
      bookmark: null,
      country: null,
      color: null,
      views: 0,
      viewedAt: null,
      metaId: 1,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      mediaCount: 0,
      valueCount: 0,
      nestedTagCount: 0,
      metaName: 'People',
      metaIcon: 'account',
      metaSynonyms: 1,
      metaBookmark: 1,
      metaCountry: 1,
      metaRating: 1,
      metaFavorite: 1,
      metaColor: 0,
      pinnedFieldCount: 0,
    }
    const gaps = buildTagSpotlightGaps(row)
    expect(gaps).toEqual(expect.arrayContaining(['synonyms', 'bookmark', 'country', 'rating']))
    const tips = buildTagSpotlightTips(row, gaps)
    expect(tips.map((tip) => tip.id)).toEqual(expect.arrayContaining([
      'no_media',
      'delete_unused',
      'view',
      'fill_info',
    ]))
  })

  it('returns a spotlight payload with sample media', () => {
    const db = createTestDb()
    seedMeta(db)
    seedTag(db, {
      id: 1,
      name: 'Alice',
      synonyms: null,
      views: 0,
      viewedAt: null,
    })
    seedTag(db, {
      id: 2,
      name: 'Bob',
      synonyms: 'Robert',
      rating: 5,
      bookmark: 'note',
      views: 3,
      viewedAt: '2026-02-01',
    })

    db.sqlite.prepare(`
      INSERT INTO media (
        id, path, name, basename, ext, mediaTypeId, favorite, views, viewedAt,
        filesize, deletedAt, createdAt, updatedAt
      ) VALUES (10, '/a.mp4', 'a', 'a', 'mp4', 1, 0, 1, '2026-02-01', 100, NULL, '2026-01-01', '2026-01-01')
    `).run()
    db.sqlite.prepare(`
      INSERT INTO tagsInMedia (mediaId, tagId, metaId) VALUES (10, 2, 1)
    `).run()

    // Always pick Alice (needs attention more) via deterministic random.
    const data = getHomeTagSpotlight(db, {random: () => 0})
    const parsed = parseHomeTagSpotlight(data)
    expect(parsed.tag).toBeTruthy()
    expect(parsed.tag?.name).toBe('Alice')
    expect(parsed.mediaCount).toBe(0)
    expect(parsed.tips?.some((tip) => tip.id === 'no_media')).toBe(true)
    expect(parsed.gaps).toEqual(expect.arrayContaining(['synonyms', 'bookmark']))
  })

  it('can exclude the previous tag on reshuffle', () => {
    const db = createTestDb()
    seedMeta(db)
    seedTag(db, {id: 1, name: 'Alice'})
    seedTag(db, {id: 2, name: 'Bob'})

    const data = getHomeTagSpotlight(db, {
      excludeTagId: 1,
      random: () => 0,
    })
    expect(data.tag?.id).toBe(2)
  })

  it('returns null tag when library has no tags', () => {
    const db = createTestDb()
    seedMeta(db)
    const data = getHomeTagSpotlight(db)
    expect(data).toEqual({tag: null})
  })
})
