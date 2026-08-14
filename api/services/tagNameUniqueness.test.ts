import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { createTestDb, closeTestDb } from '../db/testUtils/createTestDb'
import {
  assertTagNameAvailable,
  assertTagNamesAvailable,
  TagNameConflictError,
} from './tagNameUniqueness'

describe('tagNameUniqueness', () => {
  let sqlite: Database.Database
  let dbPath: string

  afterEach(() => {
    if (sqlite) closeTestDb({sqlite, dbPath})
  })

  function openDb() {
    const testDb = createTestDb('tag-name-uniqueness')
    sqlite = testDb.sqlite
    dbPath = testDb.dbPath
    sqlite.exec(`
      INSERT INTO tags (id, name, createdAt, updatedAt) VALUES
        (1, 'Alice', '2024-01-01', '2024-01-01'),
        (2, 'Bob', '2024-01-01', '2024-01-01');
    `)
  }

  it('rejects case-insensitive duplicates', () => {
    openDb()
    expect(() => assertTagNameAvailable(sqlite, ' alice ')).toThrow(TagNameConflictError)
    expect(() => assertTagNameAvailable(sqlite, 'Alice', 1)).not.toThrow()
  })

  it('rejects duplicates within the same request batch', () => {
    openDb()
    expect(() => assertTagNamesAvailable(sqlite, ['New', 'new'])).toThrow(TagNameConflictError)
  })
})
