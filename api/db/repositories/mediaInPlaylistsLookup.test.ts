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
import {createMediaInPlaylistsRepository} from './mediaInPlaylists'
import * as schema from '../schema'

function createTestDb() {
  const dbPath = path.join(
    os.tmpdir(),
    `mediachips-playlist-rel-${Date.now()}-${Math.random()}.sqlite`,
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

describe('mediaInPlaylists relation lookups', () => {
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
      INSERT INTO playlists (id, name, createdAt, updatedAt) VALUES (7, 'Favorites', '${now}', '${now}');
      INSERT INTO media (id, path, basename, name, mediaTypeId, createdAt, updatedAt) VALUES
        (1, '/one.mp4', 'one.mp4', 'One', 1, '${now}', '${now}'),
        (2, '/two.mp4', 'two.mp4', 'Two', 1, '${now}', '${now}'),
        (99, '/noise.mp4', 'noise.mp4', 'Noise', 1, '${now}', '${now}');
      INSERT INTO mediaInPlaylists (mediaId, playlistId, "order") VALUES
        (2, 7, 0),
        (1, 7, 1);
    `)
  })

  afterEach(() => {
    sqlite.close()
    fs.rmSync(dbPath, {force: true})
  })

  it('loads playlist media by linked ids with a slim projection', () => {
    const repo = createMediaInPlaylistsRepository(db)
    const rows = repo.findByPlaylistId(7)

    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.media?.path)).toEqual(['/two.mp4', '/one.mp4'])
    expect(rows[0]?.media).toMatchObject({
      id: 2,
      path: '/two.mp4',
      name: 'Two',
      basename: 'two.mp4',
      mediaTypeId: 1,
    })
    expect(rows[0]?.media).not.toHaveProperty('visualHash')
    expect(rows[0]?.media).not.toHaveProperty('contentHash')
    expect(rows[0]?.media).not.toHaveProperty('oshash')
    expect(rows[0]).not.toHaveProperty('playlist')
  })
})
