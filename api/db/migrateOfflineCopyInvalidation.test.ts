// @vitest-environment node
import {afterEach, describe, expect, it} from 'vitest'
import {createTestDb, closeTestDb, type TestDb} from './testUtils/createTestDb'
import {bootstrapDatabase} from './migrationRunner'
import {repairSchemaColumns} from './schemaRepair'
import {offlinePlayback} from '../services/mediaSources/offline'
import {DEFAULT_DRIVE_CONNECTION_ID} from '../../shared/mediaSources'

let fixture: TestDb | undefined
afterEach(() => { if (fixture) closeTestDb(fixture); fixture = undefined })

describe('offline copy invalidation upgrade', () => {
  it.each([false, true])('restores Drive playback on an older library (repair first: %s)', async repair => {
    fixture = createTestDb('offline-invalidation-upgrade')
    fixture.sqlite.exec(`
      INSERT INTO media (id, path, createdAt, updatedAt) VALUES (1, 'gdrive://movie', '2026', '2026');
      INSERT INTO sourceConnections (id, provider, config, credentialRef, createdAt)
        VALUES ('${DEFAULT_DRIVE_CONNECTION_ID}', 'gdrive', '{}', 'drive', '2026');
      INSERT INTO mediaLocations (id, mediaId, connectionId, resourceKey, version)
        VALUES ('location', 1, '${DEFAULT_DRIVE_CONNECTION_ID}', 'movie', 'v1');
      INSERT INTO offlineCopies (locationId, version, size, fileName, contentType)
        VALUES ('location', 'v1', 4, '11111111-1111-4111-8111-111111111111.media', 'video/mp4');
      ALTER TABLE offlineCopies DROP COLUMN invalidated;
    `)
    // Even an absent cache used to prevent remote playback: SELECT included the missing column.
    expect(() => offlinePlayback(fixture!, 1)).toThrow(/invalidated/)
    if (repair) expect(repairSchemaColumns(fixture.sqlite)).toContain('offlineCopies.invalidated')
    await bootstrapDatabase(fixture.dbPath)
    await bootstrapDatabase(fixture.dbPath)
    expect(fixture.sqlite.prepare('SELECT * FROM offlineCopies').get()).toEqual({
      locationId: 'location', version: 'v1', size: 4,
      fileName: '11111111-1111-4111-8111-111111111111.media', contentType: 'video/mp4', invalidated: 0,
    })
    expect(offlinePlayback(fixture, 1)).toBeNull()
    fixture.sqlite.exec('UPDATE offlineCopies SET invalidated = 1')
    await bootstrapDatabase(fixture.dbPath)
    repairSchemaColumns(fixture.sqlite)
    expect(fixture.sqlite.prepare('SELECT invalidated FROM offlineCopies').get()).toEqual({invalidated: 1})
  })
})
