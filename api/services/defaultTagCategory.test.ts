import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { createTestDb, closeTestDb } from '../db/testUtils/createTestDb'
import { findDefaultTagCategoryId } from './defaultTagCategory'

describe('findDefaultTagCategoryId', () => {
  let sqlite: Database.Database
  let dbPath: string

  afterEach(() => {
    if (sqlite) closeTestDb({sqlite, dbPath})
  })

  function openDb() {
    const testDb = createTestDb('default-tag-category')
    sqlite = testDb.sqlite
    dbPath = testDb.dbPath
  }

  it('prefers parser-enabled array meta', () => {
    openDb()
    sqlite.exec(`
      INSERT INTO meta (id, name, type, parser, createdAt, updatedAt) VALUES
        (1, 'Other', 'array', 0, '2024-01-01', '2024-01-01'),
        (2, 'Tags', 'array', 1, '2024-01-01', '2024-01-01'),
        (3, 'Title', 'string', 0, '2024-01-01', '2024-01-01');
    `)
    expect(findDefaultTagCategoryId(sqlite)).toBe(2)
  })

  it('falls back to name Tags then first array', () => {
    openDb()
    sqlite.exec(`
      INSERT INTO meta (id, name, type, parser, createdAt, updatedAt) VALUES
        (5, 'Genre', 'array', 0, '2024-01-01', '2024-01-01'),
        (6, 'tags', 'array', 0, '2024-01-01', '2024-01-01');
    `)
    expect(findDefaultTagCategoryId(sqlite)).toBe(6)

    sqlite.prepare(`DELETE FROM meta WHERE id = 6`).run()
    expect(findDefaultTagCategoryId(sqlite)).toBe(5)
  })

  it('prefers configured defaultTagCategoryId when valid', () => {
    openDb()
    sqlite.exec(`
      INSERT INTO meta (id, name, type, parser, createdAt, updatedAt) VALUES
        (1, 'Tags', 'array', 1, '2024-01-01', '2024-01-01'),
        (2, 'Girls', 'array', 0, '2024-01-01', '2024-01-01');
      INSERT INTO settings (option, value, createdAt, updatedAt) VALUES
        ('defaultTagCategoryId', '2', '2024-01-01', '2024-01-01');
    `)
    expect(findDefaultTagCategoryId(sqlite)).toBe(2)
  })

  it('ignores configured id that is missing or not an array', () => {
    openDb()
    sqlite.exec(`
      INSERT INTO meta (id, name, type, parser, createdAt, updatedAt) VALUES
        (1, 'Tags', 'array', 1, '2024-01-01', '2024-01-01'),
        (9, 'Title', 'string', 0, '2024-01-01', '2024-01-01');
      INSERT INTO settings (option, value, createdAt, updatedAt) VALUES
        ('defaultTagCategoryId', '9', '2024-01-01', '2024-01-01');
    `)
    expect(findDefaultTagCategoryId(sqlite)).toBe(1)
  })
})
