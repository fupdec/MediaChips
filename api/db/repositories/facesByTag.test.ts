/**
 * @vitest-environment node
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import Database from 'better-sqlite3'
import {drizzle} from 'drizzle-orm/better-sqlite3'
import {applySqlitePragmas} from '../pragmas'
import {runDrizzleMigrations} from '../drizzleMigrations'
import {createFacesRepository} from './faces'
import * as schema from '../schema'

function createTestDb() {
  const dbPath = path.join(
    os.tmpdir(),
    `mediachips-faces-tag-${Date.now()}-${Math.random()}.sqlite`,
  )
  runDrizzleMigrations(dbPath)

  const sqlite = new Database(dbPath)
  applySqlitePragmas(sqlite)

  return {
    sqlite,
    drizzle: drizzle(sqlite, {schema}),
    dbPath,
  }
}

describe('faces findByTagId', () => {
  let sqlite: Database.Database
  let db: ReturnType<typeof createTestDb>['drizzle']
  let dbPath: string

  beforeEach(() => {
    const testDb = createTestDb()
    sqlite = testDb.sqlite
    db = testDb.drizzle
    dbPath = testDb.dbPath

    const now = '2024-01-01T00:00:00.000Z'
    const later = '2024-02-01T00:00:00.000Z'
    sqlite.exec(`
      INSERT INTO mediaTypes (id, name, createdAt, updatedAt) VALUES (1, 'Video', '${now}', '${now}');
      INSERT INTO media (id, path, basename, name, mediaTypeId, createdAt, updatedAt) VALUES
        (100, '/a.mp4', 'a.mp4', 'A', 1, '${now}', '${now}'),
        (101, '/b.mp4', 'b.mp4', 'B', 1, '${later}', '${later}');
      INSERT INTO faces (id, mediaId, timestamp, score, x, y, width, height, cropPath, tagId, matchScore, matchStatus, createdAt) VALUES
        (1, 100, '00:01:00', 0.9, 0, 0, 0.1, 0.1, 'faces/100/1.jpg', 10, 0.88, 'matched', '${now}'),
        (2, 101, '00:02:00', 0.9, 0, 0, 0.1, 0.1, NULL, 10, 0.91, 'matched', '${later}'),
        (3, 100, '00:03:00', 0.9, 0, 0, 0.1, 0.1, NULL, 11, 0.8, 'matched', '${now}'),
        (4, 101, NULL, 0.9, 0, 0, 0.1, 0.1, NULL, NULL, NULL, NULL, '${later}');
    `)
  })

  afterEach(() => {
    sqlite.close()
    fs.rmSync(dbPath, {force: true})
  })

  it('counts faces for a tag', () => {
    const repo = createFacesRepository(db)
    expect(repo.countByTagId(10)).toBe(2)
    expect(repo.countByTagId(11)).toBe(1)
    expect(repo.countByTagId(999)).toBe(0)
  })

  it('lists appearances joined with media, ordered by media createdAt then timestamp', () => {
    const repo = createFacesRepository(db)
    const rows = repo.findByTagId(10, {sort: 'time'})

    expect(rows.map((row) => row.faceId)).toEqual([1, 2])
    expect(rows[0]).toMatchObject({
      faceId: 1,
      mediaId: 100,
      timestamp: '00:01:00',
      cropPath: 'faces/100/1.jpg',
      path: '/a.mp4',
      name: 'A',
    })
    expect(rows[0]).not.toHaveProperty('embedding')
  })

  it('supports limit and offset', () => {
    const repo = createFacesRepository(db)
    const page = repo.findByTagId(10, {sort: 'time', limit: 1, offset: 1})
    expect(page).toHaveLength(1)
    expect(page[0]?.faceId).toBe(2)
  })
})
