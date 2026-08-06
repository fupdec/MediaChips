/**
 * @vitest-environment node
 */
import {afterEach, describe, expect, it} from 'vitest'
import Database from 'better-sqlite3'
import {drizzle} from 'drizzle-orm/better-sqlite3'
import {applySqlitePragmas} from '../db/pragmas'
import type {ApiDb} from '../types/db'
import {getDuplicateCounts} from './homeHealth'

function createTestDb(): ApiDb {
  const sqlite = new Database(':memory:')
  applySqlitePragmas(sqlite)
  sqlite.exec(`
    CREATE TABLE media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      filesize INTEGER NOT NULL DEFAULT 0,
      oshash TEXT,
      visualHash TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `)

  return {
    sqlite,
    drizzle: drizzle(sqlite),
    path: ':memory:',
  } as ApiDb
}

function insertMedia(
  db: ApiDb,
  row: {
    id: number
    path: string
    filesize?: number
    oshash?: string | null
    visualHash?: string | null
  },
) {
  const now = '2026-01-01'
  db.sqlite.prepare(`
    INSERT INTO media (id, path, filesize, oshash, visualHash, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id,
    row.path,
    row.filesize ?? 1000,
    row.oshash ?? null,
    row.visualHash ?? null,
    now,
    now,
  )
}

describe('getDuplicateCounts', () => {
  let db: ApiDb

  afterEach(() => {
    db?.sqlite?.close()
  })

  it('counts exact visualHash duplicates without near-dup clustering', async () => {
    db = createTestDb()
    insertMedia(db, {id: 1, path: '/a.mp4', visualHash: 'aaaa'})
    insertMedia(db, {id: 2, path: '/b.mp4', visualHash: 'aaaa'})
    insertMedia(db, {id: 3, path: '/c.mp4', visualHash: 'bbbb'})
    insertMedia(db, {id: 4, path: '/d.mp4', visualHash: null})
    insertMedia(db, {id: 5, path: '/e.mp4', visualHash: ''})

    const counts = await getDuplicateCounts(db)

    expect(counts.byVisualHash).toBe(2)
  })

  it('counts filesize and oshash duplicate groups', async () => {
    db = createTestDb()
    insertMedia(db, {id: 1, path: '/a.mp4', filesize: 100, oshash: 'h1'})
    insertMedia(db, {id: 2, path: '/b.mp4', filesize: 100, oshash: 'h1'})
    insertMedia(db, {id: 3, path: '/c.mp4', filesize: 200, oshash: 'h2'})

    const counts = await getDuplicateCounts(db)

    expect(counts.byFilesize).toBe(2)
    expect(counts.byOshash).toBe(2)
    expect(counts.byFingerprint).toBe(2)
    expect(counts.byVisualHash).toBe(0)
  })
})
