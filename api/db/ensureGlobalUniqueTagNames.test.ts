import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assignUniqueNormalizedTagNames,
  ensureTagsNameNormalizedUniqueIndex,
  renameDuplicateTagNames,
  TAGS_NAME_NORMALIZED_UNIQUE_INDEX,
} from './ensureGlobalUniqueTagNames'

describe('ensureGlobalUniqueTagNames', () => {
  let sqlite: Database.Database

  afterEach(() => {
    sqlite?.close()
  })

  function openDb() {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE meta (
        id INTEGER PRIMARY KEY,
        name TEXT,
        type TEXT
      );
      CREATE TABLE tags (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        metaId INTEGER,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO meta (id, name, type) VALUES
        (1, 'Tags', 'array'),
        (2, 'Performers', 'array');
      INSERT INTO tags (id, name, metaId) VALUES
        (10, 'Alice', 1),
        (11, 'alice', 2),
        (12, 'Bob', 1),
        (13, 'Alice (Performers)', 1);
    `)
    return sqlite
  }

  it('renames later duplicates with category suffix and keeps both tags', () => {
    openDb()
    const renamed = renameDuplicateTagNames(sqlite)
    expect(renamed).toBe(1)

    const rows = sqlite.prepare('SELECT id, name FROM tags ORDER BY id').all() as Array<{id: number; name: string}>
    expect(rows).toEqual([
      {id: 10, name: 'Alice'},
      {id: 11, name: 'alice (Performers) 2'},
      {id: 12, name: 'Bob'},
      {id: 13, name: 'Alice (Performers)'},
    ])
  })

  it('is idempotent after names are unique', () => {
    openDb()
    expect(renameDuplicateTagNames(sqlite)).toBe(1)
    expect(renameDuplicateTagNames(sqlite)).toBe(0)
  })

  it('renames later blank names so the unique index can be created', () => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE tags (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        metaId INTEGER,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO tags (id, name, metaId) VALUES
        (1, '', 1),
        (2, '   ', 2),
        (3, 'Keep', 1);
    `)

    expect(renameDuplicateTagNames(sqlite)).toBe(1)
    const rows = sqlite.prepare('SELECT id, name FROM tags ORDER BY id').all() as Array<{id: number; name: string}>
    expect(rows[0]).toEqual({id: 1, name: ''})
    expect(rows[1]?.name).toBe('Tag (Category 2)')
    expect(rows[2]).toEqual({id: 3, name: 'Keep'})
  })

  it('assigns unique in-memory names for LowDB import', () => {
    const rows = [
      {name: 'Alice', metaId: 1},
      {name: 'alice', metaId: 2},
      {name: 'Bob', metaId: 1},
    ]
    const renamed = assignUniqueNormalizedTagNames(rows, new Map([
      [1, 'Tags'],
      [2, 'Performers'],
    ]))
    expect(renamed).toBe(1)
    expect(rows.map((row) => row.name)).toEqual(['Alice', 'alice (Performers)', 'Bob'])
  })

  it('creates the normalized unique index after renaming', () => {
    openDb()
    expect(ensureTagsNameNormalizedUniqueIndex(sqlite)).toBe(true)
    expect(ensureTagsNameNormalizedUniqueIndex(sqlite)).toBe(false)

    const index = sqlite.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?`,
    ).get(TAGS_NAME_NORMALIZED_UNIQUE_INDEX) as {name: string}
    expect(index.name).toBe(TAGS_NAME_NORMALIZED_UNIQUE_INDEX)

    expect(() => {
      sqlite.prepare('INSERT INTO tags (id, name, metaId) VALUES (99, ?, 2)').run('ALICE')
    }).toThrow()
  })
})
