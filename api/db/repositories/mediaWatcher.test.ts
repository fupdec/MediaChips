/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createTestDb, closeTestDb } from '../testUtils/createTestDb'
import { createMediaRepository } from './media'

describe('media repository folder path queries', () => {
  it('limits path entries to rows under the watched folder prefix', () => {
    const {sqlite, drizzle: db, dbPath} = createTestDb('media-watcher')
    sqlite.exec(`
      INSERT INTO media (path, mediaTypeId, createdAt, updatedAt) VALUES
        ('/watched/a.mp4', 10, '2024-01-01', '2024-01-01'),
        ('/watched/nested/b.mp4', 10, '2024-01-01', '2024-01-01'),
        ('/other/c.mp4', 10, '2024-01-01', '2024-01-01'),
        ('/watched/a.mkv', 11, '2024-01-01', '2024-01-01');
    `)

    const repo = createMediaRepository(db)
    const rows = repo.findPathEntriesByMediaTypeIdsUnderFolder([10, 11], '/watched')

    expect(rows).toHaveLength(3)
    expect(rows.map((row) => row.path).sort((a, b) => a.localeCompare(b))).toEqual([
      '/watched/a.mkv',
      '/watched/a.mp4',
      '/watched/nested/b.mp4',
    ])
    closeTestDb({sqlite, dbPath})
  })
})
