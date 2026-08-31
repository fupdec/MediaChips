/**
 * @vitest-environment node
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import type {ApiDb} from '../types/db'
import {createTestDb, closeTestDb} from '../db/testUtils/createTestDb'
import {getManualPlaylistsSummary} from './playlistSummary'

function createPlaylistSummaryDb() {
  const {sqlite, drizzle, dbPath} = createTestDb('playlist-summary')
  sqlite.exec(`
    INSERT INTO playlists (id, name, createdAt, updatedAt) VALUES
      (1, 'A', '2024-01-01', '2024-01-01'),
      (2, 'Empty', '2024-01-01', '2024-01-01');
    INSERT INTO mediaInPlaylists (mediaId, playlistId, \`order\`) VALUES
      (10, 1, 2),
      (11, 1, 0),
      (12, 1, 1),
      (13, 1, 3),
      (14, 1, 4),
      (15, 1, 5);
  `)
  return {sqlite, drizzle, dbPath, db: {sqlite, drizzle} as ApiDb}
}

describe('getManualPlaylistsSummary', () => {
  let db: ApiDb
  let sqlite: ReturnType<typeof createPlaylistSummaryDb>['sqlite']
  let dbPath: string

  beforeEach(() => {
    const testDb = createPlaylistSummaryDb()
    db = testDb.db
    sqlite = testDb.sqlite
    dbPath = testDb.dbPath
  })

  afterEach(() => {
    closeTestDb({sqlite, dbPath})
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
