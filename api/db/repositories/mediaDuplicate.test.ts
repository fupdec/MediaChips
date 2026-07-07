/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { createMediaRepository } from './media'

describe('media repository duplicate lookups', () => {
  it('finds duplicates by basename, filesize, and media type', () => {
    const sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE media (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL,
        basename TEXT,
        filesize INTEGER NOT NULL,
        mediaTypeId INTEGER,
        contentHash TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      INSERT INTO media (path, basename, filesize, mediaTypeId, contentHash, createdAt, updatedAt) VALUES
        ('/torrents/a.mp4', 'a.mp4', 1000, 1, NULL, '2024-01-01', '2024-01-01'),
        ('/other/b.mp4', 'b.mp4', 1000, 1, 'hash-b', '2024-01-01', '2024-01-01');
    `)

    const repo = createMediaRepository(drizzle(sqlite))

    expect(repo.findByBasenameFilesizeAndMediaType('a.mp4', 1000, 1)?.path).toBe('/torrents/a.mp4')
    expect(repo.findByBasenameFilesizeAndMediaType('missing.mp4', 1000, 1)).toBeUndefined()
    expect(repo.findLegacyHashCandidates(1000, 1, 'a.mp4')).toHaveLength(1)
    expect(repo.findLegacyHashCandidates(1000, 1, 'b.mp4')).toHaveLength(0)
    sqlite.close()
  })
})
