/**
 * @vitest-environment node
 */
import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {createTestDb, closeTestDb, type TestDb} from '../db/testUtils/createTestDb'
import type {ApiDb} from '../types/db'
import {
  clearHomeNavCountsCache,
  getHomeNavCounts,
} from './homeNavCounts'

describe('homeNavCounts', () => {
  let testDb: TestDb
  let db: ApiDb

  beforeEach(() => {
    clearHomeNavCountsCache()
    testDb = createTestDb('home-nav-counts')
    db = {
      sqlite: testDb.sqlite,
      drizzle: testDb.drizzle,
      path: testDb.dbPath,
    } as ApiDb

    const now = '2020-01-01T00:00:00.000Z'
    testDb.sqlite.prepare(`
      INSERT INTO mediaTypes (id, type, name, icon, createdAt, updatedAt)
      VALUES
        (1, 'video', 'Video', 'video', ?, ?),
        (2, 'image', 'Image', 'image', ?, ?)
    `).run(now, now, now, now)

    testDb.sqlite.prepare(`
      INSERT INTO media (id, path, basename, name, ext, filesize, mediaTypeId, createdAt, updatedAt)
      VALUES
        (1, '/a.mp4', 'a.mp4', 'a', 'mp4', 100, 1, ?, ?),
        (2, '/b.mp4', 'b.mp4', 'b', 'mp4', 200, 1, ?, ?),
        (3, '/c.jpg', 'c.jpg', 'c', 'jpg', 50, 2, ?, ?)
    `).run(now, now, now, now, now, now)

    testDb.sqlite.prepare(`
      INSERT INTO marks (id, type, time, mediaId) VALUES
        (1, 'favorite', 1, 1),
        (2, 'bookmark', 2, 1),
        (3, 'bookmark', 3, 2)
    `).run()

    testDb.sqlite.prepare(`
      INSERT INTO playlists (id, name, createdAt, updatedAt) VALUES (1, 'P1', ?, ?)
    `).run(now, now)

    testDb.sqlite.prepare(`
      INSERT INTO savedFilters (id, name, mediaTypeId, createdAt, updatedAt)
      VALUES (1, 'Smart', 1, ?, ?)
    `).run(now, now)
  })

  afterEach(() => {
    clearHomeNavCountsCache()
    closeTestDb(testDb)
  })

  it('returns byType, markers, and playlists without heavy extended stats', () => {
    const counts = getHomeNavCounts(db)
    expect(counts.byType).toEqual(
      expect.arrayContaining([
        {mediaTypeId: 1, count: 2},
        {mediaTypeId: 2, count: 1},
      ]),
    )
    expect(counts.markers).toBe(3)
    expect(counts.playlists).toBe(2)
  })

  it('caches results within TTL', () => {
    const first = getHomeNavCounts(db)
    testDb.sqlite.prepare(`
      INSERT INTO media (id, path, basename, name, ext, filesize, mediaTypeId, createdAt, updatedAt)
      VALUES (4, '/d.mp4', 'd.mp4', 'd', 'mp4', 10, 1, 't', 't')
    `).run()
    const second = getHomeNavCounts(db)
    expect(second).toEqual(first)
    clearHomeNavCountsCache()
    const third = getHomeNavCounts(db)
    expect(third.byType.find((row) => row.mediaTypeId === 1)?.count).toBe(3)
  })
})
