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
    `mediachips-clips-sel-${Date.now()}-${Math.random()}.sqlite`,
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

describe('findClipsByMarkIds selection order', () => {
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
      INSERT INTO media (id, path, basename, name, mediaTypeId, createdAt, updatedAt) VALUES
        (100, '/a.mp4', 'a.mp4', 'A', 1, '${now}', '${now}'),
        (101, '/b.mp4', 'b.mp4', 'B', 1, '${now}', '${now}'),
        (102, '/c.mp4', 'c.mp4', 'C', 1, '${now}', '${now}');
      INSERT INTO marks (id, type, time, end, tagId, mediaId) VALUES
        (1, 'bookmark', 10, 20, NULL, 100),
        (2, 'bookmark', 1, 5, NULL, 101),
        (3, 'bookmark', 30, 40, NULL, 102),
        (4, 'bookmark', 2, NULL, NULL, 100);
    `)
  })

  afterEach(() => {
    sqlite.close()
    fs.rmSync(dbPath, {force: true})
  })

  it('preserves input markIds order for sort selection', () => {
    const repo = createMarksRepository(db)
    const clips = repo.findClipsByMarkIds([3, 1, 2], {sort: 'selection'})
    expect(clips.map((clip) => clip.markId)).toEqual([3, 1, 2])
  })

  it('still sorts by time when sort is time', () => {
    const repo = createMarksRepository(db)
    const clips = repo.findClipsByMarkIds([3, 1, 2], {sort: 'time'})
    expect(clips.map((clip) => clip.markId)).toEqual([2, 1, 3])
  })

  it('skips marks without end', () => {
    const repo = createMarksRepository(db)
    const clips = repo.findClipsByMarkIds([4, 1], {sort: 'selection'})
    expect(clips.map((clip) => clip.markId)).toEqual([1])
  })
})
