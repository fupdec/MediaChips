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
import {createMetaRepository} from './meta'
import * as schema from '../schema'

function createTestDb() {
  const dbPath = path.join(
    os.tmpdir(),
    `mediachips-meta-mark-filters-${Date.now()}-${Math.random()}.sqlite`,
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

describe('meta.findMarkFilters', () => {
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
      INSERT INTO meta (id, type, name, icon, "order", createdAt, updatedAt) VALUES
        (1, 'array', 'Girls', 'account', 1, '${now}', '${now}'),
        (2, 'array', 'Tags', 'tag', 2, '${now}', '${now}'),
        (3, 'array', 'Profession', 'briefcase', 3, '${now}', '${now}'),
        (4, 'string', 'Notes', 'note', 4, '${now}', '${now}');
      INSERT INTO tags (id, name, color, metaId, createdAt, updatedAt) VALUES
        (10, 'Alice', '#fff', 1, '${now}', '${now}'),
        (11, 'Rimming', '#0ff', 2, '${now}', '${now}'),
        (12, 'Doctor', '#f0f', 3, '${now}', '${now}');
      INSERT INTO media (id, path, basename, name, mediaTypeId, createdAt, updatedAt) VALUES
        (100, '/a.mp4', 'a.mp4', 'A', 1, '${now}', '${now}');
      INSERT INTO marks (id, type, time, end, tagId, mediaId) VALUES
        (1, 'meta', 10, NULL, 10, 100),
        (2, 'meta', 20, 30, 11, 100),
        (3, 'favorite', 0, NULL, NULL, 100);
    `)
  })

  afterEach(() => {
    sqlite.close()
    fs.rmSync(dbPath, {force: true})
  })

  it('returns only array categories used by markers', () => {
    const repo = createMetaRepository(db)
    const filters = repo.findMarkFilters()
    expect(filters.map((row) => row.name)).toEqual(['Girls', 'Tags'])
  })

  it('returns empty when no marker tags exist', () => {
    sqlite.exec('DELETE FROM marks')
    const repo = createMetaRepository(db)
    expect(repo.findMarkFilters()).toEqual([])
  })
})
