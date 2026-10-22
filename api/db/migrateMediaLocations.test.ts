// @vitest-environment node
import fs from 'fs'
import {createHash, randomUUID} from 'crypto'
import {afterEach, describe, expect, it} from 'vitest'
import {createTestDb, type TestDb} from './testUtils/createTestDb'
import {runDrizzleMigrations} from './drizzleMigrations'
import {runPostMigrations} from './postMigrations'
import {migrateMediaLocations} from './migrateMediaLocations'
import {createMediaRepository} from './repositories/media'
import {nasMediaPath} from '../../shared/remoteMedia'
import {DEFAULT_DRIVE_CONNECTION_ID} from '../../shared/mediaSources'
import Database from 'better-sqlite3'

describe('source location migration', () => {
  let fixture: TestDb
  let copy: string | undefined
  afterEach(() => {
    if (fixture?.sqlite.open) fixture.sqlite.close()
    for (const name of [fixture?.dbPath, copy]) if (name) fs.rmSync(name, {force: true})
  })

  it('upgrades a copy of a pre-provider library, preserving card IDs, paths, chips and marks', () => {
    fixture = createTestDb('source-upgrade', '0032_media_sources')
    const connectionId = randomUUID()
    const credentialRef = randomUUID()
    fixture.sqlite.prepare('INSERT INTO sourceConnections (id, config, credentialRef, createdAt) VALUES (?, ?, ?, ?)')
      .run(connectionId, '{}', credentialRef, '2026-01-01')
    const version = '36:1000'
    const revision = createHash('sha256').update(version).digest('hex')
    const paths = ['/local/video.mp4', 'gdrive://existing-video', nasMediaPath(connectionId, 'Кино/video 1.mp4', revision),
      nasMediaPath(connectionId, 'older.mp4'), 'trash://drive-card']
    const repo = createMediaRepository(fixture.drizzle)
    paths.forEach((path, index) => {
      const card = repo.create({path, name: `Card ${index}`, basename: `original-${index}.mp4`, ext: 'mp4'})
      repo.updateById(card.id, {rating: 4, favorite: true,
        ...(index === 4 ? {deletedAt: '2026-01-01', trashOriginalPath: 'gdrive://trashed-file'} : {})})
    })
    fixture.sqlite.exec(`
      INSERT INTO meta (id, name, type, createdAt, updatedAt) VALUES (1, 'Genre', 'tags', 'old', 'old');
      INSERT INTO tags (id, name, metaId, createdAt, updatedAt) VALUES (1, 'Personal chip', 1, 'old', 'old');
      INSERT INTO tagsInMedia (mediaId, tagId, metaId) SELECT id, 1, 1 FROM media;
      INSERT INTO valuesInMedia (mediaId, metaId, value) SELECT id, 1, 'User value' FROM media;
      INSERT INTO marks (mediaId, tagId, type, text, time, end) SELECT id, 1, 'range', 'Saved marker', 12, 18 FROM media;
    `)
    const tables = ['media', 'meta', 'tags', 'tagsInMedia', 'valuesInMedia', 'marks']
    const snapshot = Object.fromEntries(tables.map(table => [table, fixture.sqlite.prepare(`SELECT * FROM ${table}`).all()]))
    // Upgrade a saved copy of the real schema tracked by migration 0032.
    fixture.sqlite.close()
    copy = `${fixture.dbPath}.copy`
    fs.copyFileSync(fixture.dbPath, copy)
    runDrizzleMigrations(copy)
    runPostMigrations(copy, {seedDemo: false})
    runDrizzleMigrations(copy)
    const upgraded = new Database(copy)
    try {
      for (const table of tables) expect(upgraded.prepare(`SELECT * FROM ${table}`).all()).toEqual(snapshot[table])
      expect(upgraded.prepare('SELECT id, provider, credentialRef FROM sourceConnections WHERE id = ?').get(connectionId))
        .toEqual({id: connectionId, provider: 'nas', credentialRef})
      const locations = upgraded.prepare('SELECT mediaId, connectionId, resourceKey, version, availability, lastVerifiedAt FROM mediaLocations ORDER BY mediaId').all()
      expect(locations).toEqual([
        {mediaId: 2, connectionId: DEFAULT_DRIVE_CONNECTION_ID, resourceKey: 'existing-video', version: '', availability: 'unknown', lastVerifiedAt: null},
        {mediaId: 3, connectionId, resourceKey: 'Кино/video 1.mp4', version: `sha256:${revision}`, availability: 'unknown', lastVerifiedAt: null},
        {mediaId: 4, connectionId, resourceKey: 'older.mp4', version: '', availability: 'unknown', lastVerifiedAt: null},
        {mediaId: 5, connectionId: DEFAULT_DRIVE_CONNECTION_ID, resourceKey: 'trashed-file', version: '', availability: 'unknown', lastVerifiedAt: null},
      ])
      expect(upgraded.pragma('foreign_key_check')).toEqual([])
    } finally { upgraded.close() }
  })

  it('retains existing NAS locations and leaves malformed or orphaned paths untouched', () => {
    fixture = createTestDb('source-preserve')
    const connectionId = randomUUID()
    const repo = createMediaRepository(fixture.drizzle)
    fixture.sqlite.prepare('INSERT INTO sourceConnections (id, config, credentialRef, createdAt) VALUES (?, ?, ?, ?)')
      .run(connectionId, '{}', randomUUID(), 'old')
    const card = repo.create({path: nasMediaPath(connectionId, 'video.mp4')})
    fixture.sqlite.prepare('INSERT INTO mediaLocations (id, mediaId, connectionId, resourceKey, version) VALUES (?, ?, ?, ?, ?)')
      .run('kept-location', card.id, connectionId, 'video.mp4', '36:1000')
    repo.create({path: nasMediaPath(randomUUID(), 'missing.mp4')})
    repo.create({path: 'gdrive://../invalid'})
    const before = fixture.sqlite.prepare('SELECT * FROM mediaLocations').all()
    migrateMediaLocations(fixture.sqlite)
    migrateMediaLocations(fixture.sqlite)
    expect(fixture.sqlite.prepare('SELECT * FROM mediaLocations').all()).toEqual(before)
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM media').get()).toEqual({count: 3})
  })
})
