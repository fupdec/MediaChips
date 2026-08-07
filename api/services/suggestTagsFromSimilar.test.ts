/**
 * @vitest-environment node
 */
import {afterEach, describe, expect, it} from 'vitest'
import Database from 'better-sqlite3'
import {drizzle} from 'drizzle-orm/better-sqlite3'
import {applySqlitePragmas} from '../db/pragmas'
import type {ApiDb} from '../types/db'
import {suggestTagsFromSimilarForMedia} from './suggestTagsFromSimilar'

function createTestDb(): ApiDb {
  const sqlite = new Database(':memory:')
  applySqlitePragmas(sqlite)
  sqlite.exec(`
    CREATE TABLE mediaTypes (
      id INTEGER PRIMARY KEY,
      type TEXT NOT NULL
    );
    CREATE TABLE media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      filesize INTEGER NOT NULL DEFAULT 0,
      visualHash TEXT,
      visualHashTiles TEXT,
      mediaTypeId INTEGER,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE tags (
      id INTEGER PRIMARY KEY,
      name TEXT,
      color TEXT,
      metaId INTEGER
    );
    CREATE TABLE tagsInMedia (
      mediaId INTEGER NOT NULL,
      tagId INTEGER NOT NULL,
      metaId INTEGER NOT NULL,
      PRIMARY KEY (mediaId, tagId, metaId)
    );
    INSERT INTO mediaTypes (id, type) VALUES (1, 'video');
  `)

  return {
    sqlite,
    drizzle: drizzle(sqlite),
    path: ':memory:',
  } as ApiDb
}

function insertMedia(
  db: ApiDb,
  row: {
    id: number
    path: string
    visualHash?: string | null
    visualHashTiles?: string | null
  },
) {
  const now = '2026-01-01'
  db.sqlite.prepare(`
    INSERT INTO media (id, path, filesize, visualHash, visualHashTiles, mediaTypeId, createdAt, updatedAt)
    VALUES (?, ?, 1000, ?, ?, 1, ?, ?)
  `).run(
    row.id,
    row.path,
    row.visualHash ?? null,
    row.visualHashTiles ?? null,
    now,
    now,
  )
}

describe('suggestTagsFromSimilarForMedia', () => {
  let db: ApiDb

  afterEach(() => {
    db?.sqlite?.close()
  })

  it('ranks neighbor tags and excludes tags already on the seed', () => {
    db = createTestDb()
    insertMedia(db, {
      id: 1,
      path: '/seed.mp4',
      visualHash: 'ffffffffffffffff',
      visualHashTiles: 'ffffffffffffffff:ffffffffffffffff',
    })
    insertMedia(db, {
      id: 2,
      path: '/near-a.mp4',
      visualHash: 'fffffffffffffffe',
      visualHashTiles: 'fffffffffffffffe:fffffffffffffffe',
    })
    insertMedia(db, {
      id: 3,
      path: '/near-b.mp4',
      visualHash: 'fffffffffffffffd',
      visualHashTiles: 'fffffffffffffffd:fffffffffffffffd',
    })
    db.sqlite.prepare(`
      INSERT INTO tags (id, name, color, metaId) VALUES
        (10, 'Lara', NULL, 5),
        (11, 'Studio', NULL, 5),
        (12, 'Owned', NULL, 5)
    `).run()
    db.sqlite.prepare(`
      INSERT INTO tagsInMedia (mediaId, tagId, metaId) VALUES
        (2, 10, 5),
        (3, 10, 5),
        (2, 11, 5),
        (1, 12, 5)
    `).run()

    const result = suggestTagsFromSimilarForMedia(db, 1, {neighborLimit: 10, tagLimit: 10})
    expect(result.hasVisualHash).toBe(true)
    expect(result.neighborCount).toBeGreaterThan(0)
    const names = result.suggestions.map((item) => item.name)
    expect(names).toContain('Lara')
    expect(names).toContain('Studio')
    expect(names).not.toContain('Owned')
    expect(result.suggestions[0]?.name).toBe('Lara')
  })

  it('can apply suggestions onto the seed', () => {
    db = createTestDb()
    insertMedia(db, {
      id: 1,
      path: '/seed.mp4',
      visualHash: 'ffffffffffffffff',
      visualHashTiles: 'ffffffffffffffff:ffffffffffffffff',
    })
    insertMedia(db, {
      id: 2,
      path: '/near.mp4',
      visualHash: 'fffffffffffffffe',
      visualHashTiles: 'fffffffffffffffe:fffffffffffffffe',
    })
    db.sqlite.prepare(`
      INSERT INTO tags (id, name, color, metaId) VALUES (10, 'Lara', NULL, 5)
    `).run()
    db.sqlite.prepare(`
      INSERT INTO tagsInMedia (mediaId, tagId, metaId) VALUES (2, 10, 5)
    `).run()

    const result = suggestTagsFromSimilarForMedia(db, 1, {apply: true, tagLimit: 5})
    expect(result.applied).toBeGreaterThan(0)
    const rows = db.sqlite.prepare(
      'SELECT tagId FROM tagsInMedia WHERE mediaId = 1 ORDER BY tagId',
    ).all() as Array<{tagId: number}>
    expect(rows.map((row) => row.tagId)).toContain(10)
  })
})
