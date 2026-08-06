/**
 * @vitest-environment node
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import Database from 'better-sqlite3'
import {drizzle} from 'drizzle-orm/better-sqlite3'
import type {ApiDb} from '../types/db'
import {applySqlitePragmas} from '../db/pragmas'
import * as schema from '../db/schema'
import {getManualPlaylistsSummary} from './playlistSummary'

function createPlaylistSummaryDb(): ApiDb {
  const sqlite = new Database(':memory:')
  applySqlitePragmas(sqlite)
  sqlite.exec(`
    CREATE TABLE playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      favorite INTEGER DEFAULT 0,
      oldId TEXT,
      createdAt TEXT NOT NULL DEFAULT '2024-01-01',
      updatedAt TEXT NOT NULL DEFAULT '2024-01-01'
    );
    CREATE TABLE mediaInPlaylists (
      mediaId INTEGER NOT NULL,
      playlistId INTEGER NOT NULL,
      \`order\` INTEGER,
      PRIMARY KEY (mediaId, playlistId)
    );
    INSERT INTO playlists (id, name) VALUES (1, 'A'), (2, 'Empty');
    INSERT INTO mediaInPlaylists (mediaId, playlistId, \`order\`) VALUES
      (10, 1, 2),
      (11, 1, 0),
      (12, 1, 1),
      (13, 1, 3),
      (14, 1, 4),
      (15, 1, 5);
  `)
  return {
    sqlite,
    drizzle: drizzle(sqlite, {schema}),
  } as ApiDb
}

describe('getManualPlaylistsSummary', () => {
  let db: ApiDb

  beforeEach(() => {
    db = createPlaylistSummaryDb()
  })

  afterEach(() => {
    db.sqlite.close()
  })

  it('returns count and first four preview ids without media payloads', async () => {
    const summaries = await getManualPlaylistsSummary(db)
    expect(summaries).toEqual([
      {
        id: 1,
        name: 'A',
        count: 6,
        previewIds: [11, 12, 10, 13],
      },
      {
        id: 2,
        name: 'Empty',
        count: 0,
        previewIds: [],
      },
    ])
    expect(summaries[0]).not.toHaveProperty('media')
    expect(summaries[0]).not.toHaveProperty('mediaIds')
  })
})
