/**
 * @vitest-environment node
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import Database from 'better-sqlite3'
import {createTestDb, closeTestDb, type TestDb} from '../testUtils/createTestDb'
import {createTagsRepository} from './tags'

describe('tags repository findAllNames', () => {
  let sqlite: Database.Database
  let db: TestDb['drizzle']
  let dbPath: string

  beforeEach(() => {
    const testDb = createTestDb('tags-names')
    sqlite = testDb.sqlite
    db = testDb.drizzle
    dbPath = testDb.dbPath
  })

  afterEach(() => {
    closeTestDb({sqlite, dbPath})
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
