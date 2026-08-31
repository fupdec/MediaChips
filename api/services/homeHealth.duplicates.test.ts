/**
 * @vitest-environment node
 */
import {afterEach, describe, expect, it} from 'vitest'
import {createTestDb as createSharedTestDb, closeTestDb} from '../db/testUtils/createTestDb'
import type {ApiDb} from '../types/db'
import {getDuplicateCounts} from './homeHealth'

let lastDbPath: string | undefined

function createTestDb(): ApiDb {
  const {sqlite, drizzle, dbPath} = createSharedTestDb('home-health-duplicates')
  lastDbPath = dbPath
  return {sqlite, drizzle, path: dbPath} as ApiDb
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
    if (db?.sqlite && lastDbPath) closeTestDb({sqlite: db.sqlite, dbPath: lastDbPath})
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
