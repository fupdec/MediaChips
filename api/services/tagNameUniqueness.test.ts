import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertTagNameAvailable,
  assertTagNamesAvailable,
  TagNameConflictError,
} from './tagNameUniqueness'

describe('tagNameUniqueness', () => {
  let sqlite: Database.Database

  afterEach(() => {
    sqlite?.close()
  })

  function openDb() {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE tags (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      );
      INSERT INTO tags (id, name) VALUES (1, 'Alice'), (2, 'Bob');
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
