/**
 * @vitest-environment node
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import Database from 'better-sqlite3'
import {drizzle} from 'drizzle-orm/better-sqlite3'
import {applySqlitePragmas} from '../pragmas'
import * as schema from '../schema'
import {createTagsRepository} from './tags'

function createTestDb() {
  const sqlite = new Database(':memory:')
  applySqlitePragmas(sqlite)
  sqlite.exec(`
    CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      synonyms TEXT,
      rating REAL DEFAULT 0,
      favorite INTEGER DEFAULT 0,
      bookmark TEXT,
      country TEXT,
      color TEXT,
      views INTEGER DEFAULT 0,
      viewedAt TEXT,
      metaId INTEGER,
      oldId TEXT,
      deletedAt TEXT,
      trashOriginalName TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE tagsInTags (
      parentTagId INTEGER NOT NULL,
      tagId INTEGER NOT NULL,
      metaId INTEGER NOT NULL,
      PRIMARY KEY (parentTagId, tagId, metaId)
    );
    CREATE TABLE valuesInTags (
      tagId INTEGER NOT NULL,
      value TEXT NOT NULL,
      metaId INTEGER NOT NULL,
      PRIMARY KEY (tagId, value, metaId)
    );
  `)
  return {
    sqlite,
    drizzle: drizzle(sqlite, {schema}),
  }
}

describe('tags repository getItemsForMeta', () => {
  let sqlite: Database.Database
  let db: ReturnType<typeof createTestDb>['drizzle']

  beforeEach(() => {
    const testDb = createTestDb()
    sqlite = testDb.sqlite
    db = testDb.drizzle
    const now = '2024-01-01'
    sqlite.prepare(`
      INSERT INTO tags (id, name, metaId, createdAt, updatedAt) VALUES
        (1, 'Ada', 17, ?, ?),
        (2, 'Bob', 17, ?, ?),
        (3, 'OtherMeta', 99, ?, ?),
        (10, 'Child', 1, ?, ?)
    `).run(now, now, now, now, now, now, now, now)

    sqlite.prepare(`
      INSERT INTO tagsInTags (parentTagId, tagId, metaId) VALUES
        (1, 10, 1),
        (2, 10, 1),
        (3, 10, 1)
    `).run()

    sqlite.prepare(`
      INSERT INTO valuesInTags (tagId, value, metaId) VALUES
        (1, 'one', 2),
        (2, 'two', 2),
        (3, 'three', 2)
    `).run()
  })

  afterEach(() => {
    sqlite.close()
  })

  it('scopes nested aggregates to the requested page ids', () => {
    const repo = createTagsRepository(db, sqlite)
    const rows = repo.getItemsForMeta(17, [1]) as Array<{
      id: number
      name: string
      tag_tags: string | null
      tag_values: string | null
    }>

    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(1)
    expect(rows[0].tag_tags).toBe('10^1')
    expect(rows[0].tag_values).toBe('one^2')
  })

  it('matches full-meta hydrate for the same rows', () => {
    const repo = createTagsRepository(db, sqlite)
    const page = repo.getItemsForMeta(17, [1, 2]) as Array<{
      id: number
      tag_tags: string | null
      tag_values: string | null
    }>
    const all = repo.getItemsForMeta(17) as Array<{
      id: number
      tag_tags: string | null
      tag_values: string | null
    }>

    const byId = new Map(all.map((row) => [row.id, row]))
    for (const row of page) {
      const full = byId.get(row.id)
      expect(full).toBeTruthy()
      expect(row.tag_tags).toBe(full!.tag_tags)
      expect(row.tag_values).toBe(full!.tag_values)
    }
  })
})
