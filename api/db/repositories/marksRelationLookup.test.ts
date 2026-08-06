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
import {createMarksRepository} from './marks'
import * as schema from '../schema'

function createTestDb() {
  const dbPath = path.join(
    os.tmpdir(),
    `mediachips-marks-rel-${Date.now()}-${Math.random()}.sqlite`,
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

describe('marks relation lookups', () => {
  let sqlite: Database.Database
  let db: ReturnType<typeof createTestDb>['drizzle']
  let dbPath: string

  beforeEach(() => {
    const testDb = createTestDb()
    sqlite = testDb.sqlite
    db = testDb.drizzle
    dbPath = testDb.dbPath

    const now = '2024-01-01T00:00:00.000Z'
    sqlite.exec(`
      INSERT INTO mediaTypes (id, name, createdAt, updatedAt) VALUES (1, 'Video', '${now}', '${now}');
      INSERT INTO meta (id, type, name, icon, createdAt, updatedAt) VALUES
        (1, 'array', 'People', 'account', '${now}', '${now}');
      INSERT INTO tags (id, name, color, metaId, createdAt, updatedAt) VALUES
        (10, 'Alice', '#fff', 1, '${now}', '${now}');
      INSERT INTO media (id, path, basename, name, mediaTypeId, createdAt, updatedAt) VALUES
        (100, '/a.mp4', 'a.mp4', 'A', 1, '${now}', '${now}'),
        (101, '/b.mp4', 'b.mp4', 'B', 1, '${now}', '${now}'),
        (999, '/noise.mp4', 'noise.mp4', 'Noise', 1, '${now}', '${now}');
      INSERT INTO marks (id, type, time, end, tagId, mediaId) VALUES
        (1, 'clip', 1, 5, 10, 100),
        (2, 'bookmark', 2, NULL, 10, 101);
    `)
  })

  afterEach(() => {
    sqlite.close()
    fs.rmSync(dbPath, {force: true})
  })

  it('hydrates findAllForVideo tags/meta without scanning unrelated rows', () => {
    const repo = createMarksRepository(db)
    const rows = repo.findAllForVideo(101)

    expect(rows).toHaveLength(1)
    expect(rows[0]?.['tag.name']).toBe('Alice')
    expect(rows[0]?.meta?.name).toBe('People')
  })

  it('hydrates clip media by id set only', () => {
    const repo = createMarksRepository(db)
    const clips = repo.findClipsByTagId(10)

    expect(clips.map((clip) => clip.id)).toEqual([100])
    expect(clips[0]?.path).toBe('/a.mp4')
  })

  it('limits clip rows in SQL', () => {
    sqlite.exec(`
      INSERT INTO marks (id, type, time, end, tagId, mediaId) VALUES
        (3, 'clip', 2, 8, 10, 101),
        (4, 'clip', 3, 9, 10, 999);
    `)

    const repo = createMarksRepository(db)
    const clips = repo.findClipsByTagId(10, {limit: 2, sort: 'time'})
    expect(clips).toHaveLength(2)
    expect(clips.map((clip) => clip.markId)).toEqual([1, 3])
  })

  it('skips the first clip row with offset', () => {
    sqlite.exec(`
      INSERT INTO marks (id, type, time, end, tagId, mediaId) VALUES
        (3, 'clip', 2, 8, 10, 101),
        (4, 'clip', 3, 9, 10, 999);
    `)

    const repo = createMarksRepository(db)
    const clips = repo.findClipsByTagId(10, {offset: 1, sort: 'time'})
    expect(clips.map((clip) => clip.markId)).toEqual([3, 4])
  })
})
