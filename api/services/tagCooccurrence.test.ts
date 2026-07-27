import {afterEach, describe, expect, it} from 'vitest'
import Database from 'better-sqlite3'
import {drizzle} from 'drizzle-orm/better-sqlite3'
import {applySqlitePragmas} from '../db/pragmas'
import type {ApiDb} from '../types/db'
import {findCooccurringTags} from './tagCooccurrence'

function createTestDb(): ApiDb {
  const sqlite = new Database(':memory:')
  applySqlitePragmas(sqlite)
  sqlite.exec(`
    CREATE TABLE media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      mediaTypeId INTEGER,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT,
      metaId INTEGER,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE tagsInMedia (
      mediaId INTEGER NOT NULL,
      tagId INTEGER NOT NULL,
      metaId INTEGER NOT NULL
    );
  `)

  return {
    sqlite,
    drizzle: drizzle(sqlite),
    path: ':memory:',
  } as ApiDb
}

describe('findCooccurringTags', () => {
  let db: ApiDb

  afterEach(() => {
    db?.sqlite?.close()
  })

  it('returns other tags on media that share the page tag', () => {
    db = createTestDb()
    const now = '2026-01-01'

    db.sqlite.prepare(
      'INSERT INTO media (id, path, mediaTypeId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
    ).run(1, '/a.mp4', 1, now, now)
    db.sqlite.prepare(
      'INSERT INTO media (id, path, mediaTypeId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
    ).run(2, '/b.mp4', 1, now, now)
    db.sqlite.prepare(
      'INSERT INTO media (id, path, mediaTypeId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
    ).run(3, '/c.mp4', 2, now, now)

    db.sqlite.prepare(
      'INSERT INTO tags (id, name, color, metaId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(10, 'Performer', null, 100, now, now)
    db.sqlite.prepare(
      'INSERT INTO tags (id, name, color, metaId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(20, 'Studio A', '#f00', 200, now, now)
    db.sqlite.prepare(
      'INSERT INTO tags (id, name, color, metaId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(21, 'Studio B', null, 200, now, now)
    db.sqlite.prepare(
      'INSERT INTO tags (id, name, color, metaId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(30, 'Other Type Only', null, 200, now, now)

    // media 1: performer + studio A
    db.sqlite.prepare('INSERT INTO tagsInMedia VALUES (?, ?, ?)').run(1, 10, 100)
    db.sqlite.prepare('INSERT INTO tagsInMedia VALUES (?, ?, ?)').run(1, 20, 200)
    // media 2: performer + studio B
    db.sqlite.prepare('INSERT INTO tagsInMedia VALUES (?, ?, ?)').run(2, 10, 100)
    db.sqlite.prepare('INSERT INTO tagsInMedia VALUES (?, ?, ?)').run(2, 21, 200)
    // media 3 (other type): performer + other
    db.sqlite.prepare('INSERT INTO tagsInMedia VALUES (?, ?, ?)').run(3, 10, 100)
    db.sqlite.prepare('INSERT INTO tagsInMedia VALUES (?, ?, ?)').run(3, 30, 200)

    const all = findCooccurringTags(db, 10)
    expect(all.map((row) => row.id).sort()).toEqual([20, 21, 30])

    const typed = findCooccurringTags(db, 10, 1)
    expect(typed.map((row) => row.id).sort()).toEqual([20, 21])
    expect(typed.find((row) => row.id === 20)?.color).toBe('#f00')
  })

  it('excludes the page tag itself and returns empty for invalid id', () => {
    db = createTestDb()
    expect(findCooccurringTags(db, 0)).toEqual([])
    expect(findCooccurringTags(db, 10)).toEqual([])
  })
})
