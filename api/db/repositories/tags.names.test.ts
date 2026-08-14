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
    )
  `)
  return {
    sqlite,
    drizzle: drizzle(sqlite, {schema}),
  }
}

describe('tags repository findAllNames', () => {
  let sqlite: Database.Database
  let db: ReturnType<typeof createTestDb>['drizzle']

  beforeEach(() => {
    const testDb = createTestDb()
    sqlite = testDb.sqlite
    db = testDb.drizzle
  })

  afterEach(() => {
    sqlite.close()
  })

  it('returns only non-empty names', () => {
    const repo = createTagsRepository(db, sqlite)
    const now = '2024-01-01'
    sqlite.prepare(`
      INSERT INTO tags (name, metaId, createdAt, updatedAt) VALUES (?, ?, ?, ?)
    `).run('Ada', 1, now, now)
    sqlite.prepare(`
      INSERT INTO tags (name, metaId, createdAt, updatedAt) VALUES (?, ?, ?, ?)
    `).run('', 1, now, now)
    sqlite.prepare(`
      INSERT INTO tags (name, metaId, createdAt, updatedAt) VALUES (?, ?, ?, ?)
    `).run('Bob', 2, now, now)

    expect(repo.findAllNames()).toEqual([
      {name: 'Ada'},
      {name: 'Bob'},
    ])
  })

  it('returns id/name/synonyms lookup rows', () => {
    const repo = createTagsRepository(db, sqlite)
    const now = '2024-01-01'
    sqlite.prepare(`
      INSERT INTO tags (name, synonyms, metaId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)
    `).run('Ada', 'Aida', 1, now, now)

    expect(repo.findAllLookup()).toEqual([
      {id: 1, name: 'Ada', synonyms: 'Aida'},
    ])
  })
})
