import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { findDefaultTagCategoryId } from './defaultTagCategory'

describe('findDefaultTagCategoryId', () => {
  let sqlite: Database.Database

  afterEach(() => {
    sqlite?.close()
  })

  it('prefers parser-enabled array meta', () => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE meta (
        id INTEGER PRIMARY KEY,
        name TEXT,
        type TEXT,
        parser INTEGER
      );
      INSERT INTO meta (id, name, type, parser) VALUES
        (1, 'Other', 'array', 0),
        (2, 'Tags', 'array', 1),
        (3, 'Title', 'string', 0);
    `)
    expect(findDefaultTagCategoryId(sqlite)).toBe(2)
  })

  it('falls back to name Tags then first array', () => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE meta (
        id INTEGER PRIMARY KEY,
        name TEXT,
        type TEXT,
        parser INTEGER
      );
      INSERT INTO meta (id, name, type, parser) VALUES
        (5, 'Genre', 'array', 0),
        (6, 'tags', 'array', 0);
    `)
    expect(findDefaultTagCategoryId(sqlite)).toBe(6)

    sqlite.prepare(`DELETE FROM meta WHERE id = 6`).run()
    expect(findDefaultTagCategoryId(sqlite)).toBe(5)
  })

  it('prefers configured defaultTagCategoryId when valid', () => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE meta (
        id INTEGER PRIMARY KEY,
        name TEXT,
        type TEXT,
        parser INTEGER
      );
      CREATE TABLE settings (
        option TEXT PRIMARY KEY,
        value TEXT
      );
      INSERT INTO meta (id, name, type, parser) VALUES
        (1, 'Tags', 'array', 1),
        (2, 'Girls', 'array', 0);
      INSERT INTO settings (option, value) VALUES ('defaultTagCategoryId', '2');
    `)
    expect(findDefaultTagCategoryId(sqlite)).toBe(2)
  })

  it('ignores configured id that is missing or not an array', () => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE meta (
        id INTEGER PRIMARY KEY,
        name TEXT,
        type TEXT,
        parser INTEGER
      );
      CREATE TABLE settings (
        option TEXT PRIMARY KEY,
        value TEXT
      );
      INSERT INTO meta (id, name, type, parser) VALUES
        (1, 'Tags', 'array', 1),
        (9, 'Title', 'string', 0);
      INSERT INTO settings (option, value) VALUES ('defaultTagCategoryId', '9');
    `)
    expect(findDefaultTagCategoryId(sqlite)).toBe(1)
  })
})
