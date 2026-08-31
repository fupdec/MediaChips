/**
 * @vitest-environment node
 */
import {describe, expect, it} from 'vitest'
import {createTestDb as createSharedTestDb, closeTestDb} from '../testUtils/createTestDb'
import {createMediaRepository} from './media'

function createTestDb() {
  const {sqlite, drizzle: db, dbPath} = createSharedTestDb('media-scan-projection')
  return {sqlite, db, dbPath}
}

describe('media repository scan projections', () => {
  it('loads ordered id+path rows without hash columns', () => {
    const {sqlite, db, dbPath} = createTestDb()
    sqlite.exec(`
      INSERT INTO media (id, path, filesize, oshash, visualHashTiles, createdAt, updatedAt) VALUES
        (2, '/b.mp4', 20, 'hb', 'tiles-b', 't', 't'),
        (1, '/a.mp4', 10, 'ha', 'tiles-a', 't', 't');
    `)

    const rows = createMediaRepository(db).findAllIdsAndPathsOrderedById()
    expect(rows).toEqual([
      {id: 1, path: '/a.mp4'},
      {id: 2, path: '/b.mp4'},
    ])
    expect(rows[0]).not.toHaveProperty('visualHashTiles')
    expect(rows[0]).not.toHaveProperty('oshash')
    closeTestDb({sqlite, dbPath})
  })

  it('loads missing-scan rows with size and oshash only', () => {
    const {sqlite, db, dbPath} = createTestDb()
    sqlite.exec(`
      INSERT INTO media (id, path, filesize, oshash, visualHashTiles, bookmark, createdAt, updatedAt) VALUES
        (1, '/a.mp4', 10, 'ha', 'tiles-a', 'mark', 't', 't');
    `)

    const rows = createMediaRepository(db).findAllForMissingScanOrderedById()
    expect(rows).toEqual([
      {id: 1, path: '/a.mp4', filesize: 10, oshash: 'ha'},
    ])
    expect(rows[0]).not.toHaveProperty('visualHashTiles')
    expect(rows[0]).not.toHaveProperty('bookmark')
    closeTestDb({sqlite, dbPath})
  })

  it('findByPaths returns slim path entries without hash blobs', () => {
    const {sqlite, db, dbPath} = createTestDb()
    sqlite.exec(`
      INSERT INTO media (id, path, mediaTypeId, visualHashTiles, contentHash, createdAt, updatedAt) VALUES
        (1, '/a.mp4', 1, 'tiles', 'ch', 't', 't'),
        (2, '/b.mp4', 2, 'tiles', 'ch', 't', 't');
    `)

    const rows = createMediaRepository(db).findByPaths(['/a.mp4', '/b.mp4', '/missing.mp4'], 1)
    expect(rows).toEqual([{id: 1, path: '/a.mp4', mediaTypeId: 1}])
    expect(rows[0]).not.toHaveProperty('visualHashTiles')
    expect(rows[0]).not.toHaveProperty('contentHash')
    closeTestDb({sqlite, dbPath})
  })
})
