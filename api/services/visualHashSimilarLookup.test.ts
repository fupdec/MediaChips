/**
 * @vitest-environment node
 */
import {afterEach, describe, expect, it} from 'vitest'
import {createTestDb as createSharedTestDb, closeTestDb} from '../db/testUtils/createTestDb'
import type {ApiDb} from '../types/db'
import {findVisualSimilarIds} from './visualHashBackfill'

let lastDbPath: string | undefined

function createTestDb(): ApiDb {
  const {sqlite, drizzle, dbPath} = createSharedTestDb('visual-hash-similar')
  lastDbPath = dbPath
  sqlite.exec(`
    INSERT INTO mediaTypes (id, type, createdAt, updatedAt) VALUES (1, 'video', '2026-01-01', '2026-01-01');
  `)

  return {sqlite, drizzle, path: dbPath} as ApiDb
}

function insertMedia(
  db: ApiDb,
  row: {
    id: number
    path: string
    visualHash?: string | null
    visualHashTiles?: string | null
  },
) {
  const now = '2026-01-01'
  db.sqlite.prepare(`
    INSERT INTO media (id, path, filesize, visualHash, visualHashTiles, mediaTypeId, createdAt, updatedAt)
    VALUES (?, ?, 1000, ?, ?, 1, ?, ?)
  `).run(
    row.id,
    row.path,
    row.visualHash ?? null,
    row.visualHashTiles ?? null,
    now,
    now,
  )
}

describe('findVisualSimilarIds', () => {
  let db: ApiDb

  afterEach(() => {
    if (db?.sqlite && lastDbPath) closeTestDb({sqlite: db.sqlite, dbPath: lastDbPath})
  })

  it('returns seed-first similar ids without requiring full-type tile payloads', async () => {
    db = createTestDb()
    insertMedia(db, {
      id: 1,
      path: '/seed.mp4',
      visualHash: 'ffffffffffffffff',
      visualHashTiles: 'ffffffffffffffff:ffffffffffffffff',
    })
    insertMedia(db, {
      id: 2,
      path: '/near.mp4',
      visualHash: 'fffffffffffffffe',
      visualHashTiles: 'fffffffffffffffe:fffffffffffffffe',
    })
    insertMedia(db, {
      id: 3,
      path: '/far.mp4',
      visualHash: '0000000000000000',
      visualHashTiles: '0000000000000000:0000000000000000',
    })
    insertMedia(db, {
      id: 4,
      path: '/nohash.mp4',
      visualHash: null,
    })

    const result = findVisualSimilarIds(db, 1, {limit: 10})

    expect(result.hasVisualHash).toBe(true)
    expect(result.ids[0]).toBe(1)
    expect(result.ids).toContain(2)
    expect(result.ids).not.toContain(3)
    expect(result.ids).not.toContain(4)
  })

  it('reports missing visual hash for the seed', () => {
    db = createTestDb()
    insertMedia(db, {id: 1, path: '/seed.mp4', visualHash: null})

    expect(findVisualSimilarIds(db, 1)).toEqual({
      seedId: 1,
      hasVisualHash: false,
      ids: [],
    })
  })
})
