import Database from 'better-sqlite3'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {drizzle} from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import type {ApiDb} from '../types/db'
import {
  hardDeletePlaylistCascade,
  hardDeleteSavedFilterCascade,
  restoreTrashTags,
  softDeleteMark,
  softDeletePlaylist,
  softDeleteSavedFilter,
  softDeleteTag,
} from './entityTrash'
import {nowIso} from '../db/utils/timestamps'

function makeDb(): ApiDb {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      synonyms TEXT,
      rating INTEGER DEFAULT 0 NOT NULL,
      favorite INTEGER DEFAULT 0 NOT NULL,
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
    CREATE UNIQUE INDEX tags_name_normalized_unique ON tags (lower(trim(name)));
    CREATE TABLE marks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      text TEXT,
      time INTEGER,
      end INTEGER,
      tagId INTEGER,
      mediaId INTEGER,
      icon TEXT,
      deletedAt TEXT
    );
    CREATE TABLE playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      favorite INTEGER DEFAULT 0,
      oldId TEXT,
      deletedAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE mediaInPlaylists (
      mediaId INTEGER NOT NULL,
      playlistId INTEGER NOT NULL,
      "order" INTEGER
    );
    CREATE TABLE savedFilters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      metaId INTEGER,
      mediaTypeId INTEGER,
      tagId INTEGER,
      tabId INTEGER,
      sortBy TEXT,
      sortDir TEXT,
      size INTEGER,
      view INTEGER,
      groupBy TEXT,
      filtersJoin TEXT DEFAULT 'and',
      deletedAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE filterRows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      "order" INTEGER DEFAULT 0
    );
    CREATE TABLE filterRowsInSavedFilters (
      filterId INTEGER NOT NULL,
      rowId INTEGER NOT NULL
    );
    CREATE TABLE tagsInFilterRows (
      tagId INTEGER NOT NULL,
      rowId INTEGER NOT NULL,
      metaId INTEGER NOT NULL
    );
  `)
  return {
    sqlite,
    drizzle: drizzle(sqlite, {schema}),
    path: '/tmp',
  } as ApiDb
}

describe('entityTrash soft-delete', () => {
  let db: ApiDb

  beforeEach(() => {
    db = makeDb()
  })

  afterEach(() => {
    db.sqlite.close()
  })

  it('soft-deletes tags with name rewrite and restores them', () => {
    const ts = nowIso()
    const tag = db.sqlite.prepare(`
      INSERT INTO tags (name, metaId, createdAt, updatedAt)
      VALUES ('Alice', 1, ?, ?)
      RETURNING id
    `).get(ts, ts) as {id: number}

    expect(softDeleteTag(db, tag.id)).toBe(true)
    const trashed = db.sqlite.prepare('SELECT name, deletedAt, trashOriginalName FROM tags WHERE id = ?')
      .get(tag.id) as {name: string; deletedAt: string; trashOriginalName: string}
    expect(trashed.deletedAt).toBeTruthy()
    expect(trashed.trashOriginalName).toBe('Alice')
    expect(trashed.name).toContain('__mediachips_trash__')

    const restored = restoreTrashTags(db, [tag.id])
    expect(restored).toEqual([tag.id])
    const active = db.sqlite.prepare('SELECT name, deletedAt FROM tags WHERE id = ?')
      .get(tag.id) as {name: string; deletedAt: string | null}
    expect(active.name).toBe('Alice')
    expect(active.deletedAt).toBeNull()
  })

  it('soft-deletes marks, playlists, and saved filters', () => {
    const ts = nowIso()
    const mark = db.sqlite.prepare(`INSERT INTO marks (type, text) VALUES ('bookmark', 'x') RETURNING id`)
      .get() as {id: number}
    const playlist = db.sqlite.prepare(`
      INSERT INTO playlists (name, createdAt, updatedAt) VALUES ('Fav', ?, ?) RETURNING id
    `).get(ts, ts) as {id: number}
    const filter = db.sqlite.prepare(`
      INSERT INTO savedFilters (name, createdAt, updatedAt) VALUES ('Smart', ?, ?) RETURNING id
    `).get(ts, ts) as {id: number}

    expect(softDeleteMark(db, mark.id)).toBe(true)
    expect(softDeletePlaylist(db, playlist.id)).toBe(true)
    expect(softDeleteSavedFilter(db, filter.id)).toBe(true)

    expect((db.sqlite.prepare('SELECT deletedAt FROM marks WHERE id = ?').get(mark.id) as {deletedAt: string}).deletedAt).toBeTruthy()
    expect((db.sqlite.prepare('SELECT deletedAt FROM playlists WHERE id = ?').get(playlist.id) as {deletedAt: string}).deletedAt).toBeTruthy()
    expect((db.sqlite.prepare('SELECT deletedAt FROM savedFilters WHERE id = ?').get(filter.id) as {deletedAt: string}).deletedAt).toBeTruthy()
  })

  it('hard purge cascades playlist membership and saved filter rows', () => {
    const ts = nowIso()
    const playlist = db.sqlite.prepare(`
      INSERT INTO playlists (name, createdAt, updatedAt) VALUES ('P', ?, ?) RETURNING id
    `).get(ts, ts) as {id: number}
    db.sqlite.prepare(`INSERT INTO mediaInPlaylists (mediaId, playlistId, "order") VALUES (1, ?, 0)`).run(playlist.id)

    const filter = db.sqlite.prepare(`
      INSERT INTO savedFilters (name, createdAt, updatedAt) VALUES ('F', ?, ?) RETURNING id
    `).get(ts, ts) as {id: number}
    const row = db.sqlite.prepare(`INSERT INTO filterRows (type, "order") VALUES ('rating', 0) RETURNING id`)
      .get() as {id: number}
    db.sqlite.prepare(`INSERT INTO filterRowsInSavedFilters (filterId, rowId) VALUES (?, ?)`).run(filter.id, row.id)
    db.sqlite.prepare(`INSERT INTO tagsInFilterRows (tagId, rowId, metaId) VALUES (1, ?, 1)`).run(row.id)

    hardDeletePlaylistCascade(db, playlist.id)
    hardDeleteSavedFilterCascade(db, filter.id)

    expect(db.sqlite.prepare('SELECT COUNT(*) AS c FROM playlists').get() as {c: number}).toEqual({c: 0})
    expect(db.sqlite.prepare('SELECT COUNT(*) AS c FROM mediaInPlaylists').get() as {c: number}).toEqual({c: 0})
    expect(db.sqlite.prepare('SELECT COUNT(*) AS c FROM savedFilters').get() as {c: number}).toEqual({c: 0})
    expect(db.sqlite.prepare('SELECT COUNT(*) AS c FROM filterRows').get() as {c: number}).toEqual({c: 0})
    expect(db.sqlite.prepare('SELECT COUNT(*) AS c FROM tagsInFilterRows').get() as {c: number}).toEqual({c: 0})
  })
})
