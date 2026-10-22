// @vitest-environment node
import {afterEach, describe, expect, it} from 'vitest'
import {createTestDb, closeTestDb, type TestDb} from './testUtils/createTestDb'
import {runDrizzleMigrations} from './drizzleMigrations'
import {repairSchemaColumns} from './schemaRepair'
import {listMediaCopies} from '../services/mediaSources/copies'
import {copyVerificationMethod} from '../services/mediaSources/copyVerification'

let fixture: TestDb | undefined
afterEach(() => { if (fixture) closeTestDb(fixture); fixture = undefined })

describe('copy verification method migration', () => {
  it.each([false, true])('preserves existing SHA-256 evidence and preferences (repair first: %s)', repair => {
    fixture = createTestDb('copy-method-upgrade', '0037_verified_media_copies')
    fixture.sqlite.exec(`
      INSERT INTO media (id, path, createdAt, updatedAt) VALUES (1, '/media/original.mp4', '2026', '2026');
      INSERT INTO verifiedMediaCopies (id, mediaId, path, version, sha256, size, contentType, verifiedAt)
        VALUES ('original-copy', 1, '/media/original.mp4', 'v1', '${'a'.repeat(64)}', 1000000, 'video/mp4', '2026');
      INSERT INTO mediaCopyPreferences VALUES (1, 'original-copy');
    `)
    if (repair) repairSchemaColumns(fixture.sqlite)
    runDrizzleMigrations(fixture.dbPath)
    runDrizzleMigrations(fixture.dbPath)
    expect(fixture.sqlite.prepare('SELECT id, sha256, oshash, verificationMethod FROM verifiedMediaCopies').get())
      .toEqual({id: 'original-copy', sha256: 'a'.repeat(64), oshash: null, verificationMethod: 'sha256'})
    expect(listMediaCopies(fixture, 1)).toMatchObject({preferredId: 'original-copy', copies: [{verificationMethod: 'sha256', verified: true}]})
    expect(copyVerificationMethod(fixture)).toBe('oshash')
  })
})
