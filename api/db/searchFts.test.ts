/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { ensureSearchFtsIndex, hasSearchFtsIndex } from './searchFts'

function createTagsTable(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT
    );
    CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      synonyms TEXT
    );
  `)
}

describe('ensureSearchFtsIndex', () => {
  it('creates FTS tables and keeps them in sync via triggers', () => {
    const sqlite = new Database(':memory:')
    createTagsTable(sqlite)

    const installed = ensureSearchFtsIndex(sqlite)
    expect(installed).toEqual(['media_fts', 'tags_fts'])
    expect(hasSearchFtsIndex(sqlite)).toBe(true)

    sqlite.prepare(`INSERT INTO media (id, name) VALUES (?, ?)`).run(1, 'Alpha')
    sqlite.prepare(`INSERT INTO tags (id, name, synonyms) VALUES (?, ?, ?)`).run(1, 'Beta', 'Gamma')

    expect(sqlite.prepare(`SELECT rowid FROM media_fts WHERE media_fts MATCH '"alp"*'`).all()).toHaveLength(1)
    expect(sqlite.prepare(`SELECT rowid FROM tags_fts WHERE tags_fts MATCH '"gam"*'`).all()).toHaveLength(1)

    sqlite.prepare(`UPDATE tags SET name = ? WHERE id = ?`).run('Beta updated', 1)
    expect(sqlite.prepare(`SELECT name FROM tags WHERE id = 1`).get()).toEqual({name: 'Beta updated'})
    expect(sqlite.prepare(`SELECT rowid FROM tags_fts WHERE tags_fts MATCH '"beta"*'`).all()).toHaveLength(1)

    const installedAgain = ensureSearchFtsIndex(sqlite)
    expect(installedAgain).toEqual([])
    sqlite.close()
  })

  it('migrates legacy FTS tables that cannot update rows', () => {
    const sqlite = new Database(':memory:')
    createTagsTable(sqlite)

    sqlite.exec(`
      CREATE VIRTUAL TABLE tags_fts USING fts5(
        name,
        synonyms,
        tokenize='unicode61 remove_diacritics 2'
      );

      CREATE TRIGGER tags_fts_insert AFTER INSERT ON tags BEGIN
        INSERT INTO tags_fts(rowid, name, synonyms)
        VALUES (new.id, COALESCE(new.name, ''), COALESCE(new.synonyms, ''));
      END;

      CREATE TRIGGER tags_fts_update AFTER UPDATE OF name, synonyms ON tags BEGIN
        INSERT INTO tags_fts(tags_fts, rowid, name, synonyms)
        VALUES ('delete', old.id, COALESCE(old.name, ''), COALESCE(old.synonyms, ''));
        INSERT INTO tags_fts(rowid, name, synonyms)
        VALUES (new.id, COALESCE(new.name, ''), COALESCE(new.synonyms, ''));
      END;
    `)

    sqlite.prepare(`INSERT INTO tags (id, name, synonyms) VALUES (?, ?, ?)`).run(1, 'Beta', 'Gamma')
    expect(() => sqlite.prepare(`UPDATE tags SET name = ? WHERE id = ?`).run('Beta updated', 1)).toThrow()

    const migrated = ensureSearchFtsIndex(sqlite)
    expect(migrated).toEqual(['media_fts', 'tags_fts'])

    sqlite.prepare(`UPDATE tags SET name = ? WHERE id = ?`).run('Beta updated', 1)
    expect(sqlite.prepare(`SELECT name FROM tags WHERE id = 1`).get()).toEqual({name: 'Beta updated'})
    expect(sqlite.prepare(`SELECT rowid FROM tags_fts WHERE tags_fts MATCH '"beta"*'`).all()).toHaveLength(1)

    sqlite.close()
  })
})
