import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { createTestDb, closeTestDb } from '../db/testUtils/createTestDb'
import {
  assertTagNameAvailable,
  assertTagNamesAvailable,
  findTrashedTagsByNormalizedNames,
  TagNameConflictError,
  TagNameInTrashError,
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

  it('ignores soft-deleted tags when checking availability', () => {
    openDb()
    sqlite.prepare(`UPDATE tags SET deletedAt = ? WHERE id = 1`).run('2024-01-01')
    expect(() => assertTagNameAvailable(sqlite, 'Alice')).not.toThrow()
  })

  it('finds trashed tags by original name', () => {
    openDb()
    sqlite.prepare(`
      UPDATE tags
      SET deletedAt = ?, trashOriginalName = name, name = ?
      WHERE id = 1
    `).run('2024-01-01', '__mediachips_trash__/1/Alice')

    const matches = findTrashedTagsByNormalizedNames(sqlite, ['alice'])
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({id: 1, originalName: 'Alice'})
    expect(() => {
      throw new TagNameInTrashError(matches)
    }).toThrow(TagNameInTrashError)
  })
})
