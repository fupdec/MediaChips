// @vitest-environment node
import fs from 'fs'
import path from 'path'
import os from 'os'
import {beforeEach, afterEach, describe, it, expect, vi} from 'vitest'
import {createTestDb, closeTestDb, type TestDb} from '../../db/testUtils/createTestDb'
import {createMediaTypesRepository} from '../../db/repositories/mediaTypes'
import {createMediaRepository} from '../../db/repositories/media'
import {createCloudDriveService, createMockDriveTransport} from './index'
import {importDriveFile, listDriveFolder, driveLibraryFile} from './library'
import type {ApiDb} from '../../types/db'
import {driveMediaPath} from '../../../shared/cloudDrive'
import {isRemoteMediaPath} from '../../../shared/remoteMedia'
import {collectMissingMediaByPathExist} from '../missingMediaExistScan'
import {sourceConnections, mediaLocations, marks, tagsInMedia} from '../../db/schema'
import {resolveMediaLocation} from '../mediaSources/locations'
import {createNasService} from '../nas/service'
import {migrateMediaLocations} from '../../db/migrateMediaLocations'

vi.mock('../mediaCacheInvalidation', () => ({invalidateMediaDerivedCaches: vi.fn()}))
describe('Google Drive library import', () => {
  let fixture: TestDb
  let db: ApiDb
  let directory: string
  let service: ReturnType<typeof createCloudDriveService>
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-drive-library-'))
    fixture = createTestDb('drive')
    db = {...fixture, path: directory}
    for (const type of ['video', 'audio', 'image']) createMediaTypesRepository(db.drizzle).create({name: type, type})
    service = createCloudDriveService({config: {clientId: '', clientSecret: '', redirectUri: '',
      configured: true, mock: true, scopes: [], tokenStorePath: path.join(directory, 'tokens.json')}})
  })
  afterEach(() => {closeTestDb(fixture); fs.rmSync(directory, {recursive: true, force: true}); vi.restoreAllMocks()})
  it('imports provider metadata through the legacy Drive transport and fills gaps on reimport', async () => {
    const get = service.transport.getFileMeta.bind(service.transport)
    vi.spyOn(service.transport, 'getFileMeta').mockImplementation(async id => ({...await get(id),
      videoMediaMetadata: {durationMillis: '45600', width: 1920, height: 1080},
    }))
    const added = await importDriveFile(db, service, 'mock-video-sample')
    const {createVideoMetadataRepository} = await import('../../db/repositories/videoMetadata')
    const metadata = createVideoMetadataRepository(db.drizzle)
    expect(metadata.findByMediaId(added.id)).toMatchObject({duration: 45.6, width: 1920, height: 1080})
    metadata.updateByMediaId(added.id, {height: 0, duration: 100, time: 17})
    await importDriveFile(db, service, 'mock-video-sample')
    expect(metadata.findByMediaId(added.id)).toMatchObject({duration: 100, height: 1080, time: 17})
  })

  it('stores remote identity, deduplicates and marks the listing without downloading', async () => {
    const download = vi.spyOn(service.transport, 'downloadFile')
    const added = await importDriveFile(db, service, 'mock-video-sample')
    expect(added.created).toBe(true)
    expect(await importDriveFile(db, service, 'mock-video-sample')).toEqual({...added, created: false})
    const {row, fileId} = driveLibraryFile(db, added.id)
    expect(row.path).toBe(driveMediaPath(fileId))
    expect(isRemoteMediaPath(row.path)).toBe(true)
    expect(download).not.toHaveBeenCalled()
    expect(fixture.sqlite.prepare('SELECT reasons FROM copyDiscoveryAutoRequests').all()).toEqual([{reasons: JSON.stringify(['import'])}])
    expect(fixture.drizzle.select().from(mediaLocations).all()).toMatchObject([{mediaId: added.id, resourceKey: fileId, availability: 'available'}])
    expect(resolveMediaLocation(db, added.id)).toMatchObject({provider: 'gdrive', connection: {provider: 'gdrive'}})
    expect(createNasService().connections(db)).toEqual([])
    const listed = await listDriveFolder(db, service, 'root')
    expect(listed.files.find(file => file.id === fileId)?.mediaId).toBe(added.id)
    expect(fixture.sqlite.prepare("SELECT q.reasons FROM copyDiscoveryAutoRequests q JOIN copyDiscoveryAutoRoots r ON r.id = q.rootId WHERE r.key = 'root'").get()).toEqual({reasons: JSON.stringify(['folder_update'])})
    expect(await collectMissingMediaByPathExist([{id: row.id, path: row.path}], {pathExists: async () => false})).toEqual([])
  })
  it('deduplicates overlapping imports and isolates invalid files without reading originals', async () => {
    const download = vi.spyOn(service.transport, 'downloadFile')
    const results = await Promise.allSettled([
      importDriveFile(db, service, 'mock-video-sample'),
      importDriveFile(db, service, '../invalid'),
      importDriveFile(db, service, 'mock-video-sample'),
    ])
    const [first, failed, repeated] = results
    expect(first.status).toBe('fulfilled')
    expect(failed.status).toBe('rejected')
    expect(repeated.status).toBe('fulfilled')
    if (first.status === 'fulfilled' && repeated.status === 'fulfilled') {
      expect(repeated.value).toEqual({...first.value, created: false})
    }
    expect(fixture.drizzle.select().from(mediaLocations).all()).toHaveLength(1)
    expect(download).not.toHaveBeenCalled()
  })
  it('imports images and audio into their own media types, rejects documents', async () => {
    const meta = vi.spyOn(service.transport, 'getFileMeta')
    for (const [kind, name, mimeType] of [['audio', 'music.mp3', 'audio/mpeg'], ['image', 'photo.jpg', 'image/jpeg']]) {
      meta.mockResolvedValue({id: kind, name, mimeType, size: 100})
      const result = await importDriveFile(db, service, kind)
      const row = createMediaRepository(db.drizzle).findById(result.id)!
      expect(createMediaTypesRepository(db.drizzle).findById(row.mediaTypeId!)?.type).toBe(kind)
    }
    meta.mockResolvedValue({id: 'doc', name: 'doc.mp4', mimeType: 'application/vnd.google-apps.document', size: 100})
    await expect(importDriveFile(db, service, 'doc')).rejects.toMatchObject({status: 415})
  })
  it.each([
    ['Movie.WMV', 'video/x-ms-wmv'], ['Movie.mkv', 'application/x-matroska'],
    ['Movie.avi', 'video/x-msvideo'], ['Movie.m2ts', 'application/octet-stream'],
    ['Movie.wmv', 'application/vnd.ms-asf'],
  ])('imports %s with MIME %s without downloading it', async (name, mimeType) => {
    vi.spyOn(service.transport, 'getFileMeta').mockResolvedValue({id: 'movie', name, mimeType, size: 100})
    const download = vi.spyOn(service.transport, 'downloadFile')
    const added = await importDriveFile(db, service, 'movie')
    const row = createMediaRepository(db.drizzle).findById(added.id)!
    expect(createMediaTypesRepository(db.drizzle).findById(row.mediaTypeId!)?.type).toBe('video')
    expect(row.path).toBe('gdrive://movie')
    expect(download).not.toHaveBeenCalled()
  })
  it('refuses invalid IDs, disconnected imports and media that belongs to another source', async () => {
    await expect(importDriveFile(db, service, '../secret')).rejects.toThrow()
    service = createCloudDriveService({config: {...service.config, mock: false}, transport: createMockDriveTransport()})
    await expect(importDriveFile(db, service, 'mock-video-sample')).rejects.toMatchObject({status: 409})
    const local = createMediaRepository(db.drizzle).create({path: '/local/movie.mp4'})
    expect(() => driveLibraryFile(db, local.id)).toThrow(/not found/)
  })
  it('preserves trashed entries and rejects a library switch during metadata loading', async () => {
    const added = await importDriveFile(db, service, 'mock-video-sample')
    createMediaRepository(db.drizzle).updateById(added.id, {deletedAt: new Date().toISOString(), trashOriginalPath: driveMediaPath('mock-video-sample'), path: 'trash://test'})
    await expect(importDriveFile(db, service, 'mock-video-sample')).rejects.toMatchObject({status: 409})
    vi.spyOn(service.transport, 'getFileMeta').mockImplementation(async () => {
      db.sqlite = {} as ApiDb['sqlite']
      return {id: 'next', name: 'next.mp4', mimeType: 'video/mp4', size: 100}
    })
    await expect(importDriveFile(db, service, 'next')).rejects.toMatchObject({status: 409})
  })
  it('keeps the same card, chips and markers when OAuth credentials are replaced', async () => {
    service = createCloudDriveService({config: {...service.config, mock: false}, transport: createMockDriveTransport()})
    service.store.set({accessToken: 'first-token', refreshToken: 'first-refresh'})
    const added = await importDriveFile(db, service, 'mock-video-sample')
    fixture.sqlite.exec(`
      INSERT INTO meta (id, name, type, createdAt, updatedAt) VALUES (1, 'Genre', 'tags', 'old', 'old');
      INSERT INTO tags (id, name, metaId, createdAt, updatedAt) VALUES (1, 'My chip', 1, 'old', 'old');
    `)
    fixture.drizzle.insert(tagsInMedia).values({mediaId: added.id, metaId: 1, tagId: 1}).run()
    fixture.drizzle.insert(marks).values({mediaId: added.id, time: 12, text: 'My marker'}).run()
    const card = createMediaRepository(db.drizzle).findById(added.id)
    const location = fixture.drizzle.select().from(mediaLocations).get()!
    const connection = fixture.drizzle.select().from(sourceConnections).get()!
    service.logout()
    expect(driveLibraryFile(db, added.id).row).toEqual(card)
    service.store.set({accessToken: 'replacement-token', refreshToken: 'replacement-refresh'})
    expect(await importDriveFile(db, service, 'mock-video-sample')).toMatchObject({id: added.id, created: false})
    expect(createMediaRepository(db.drizzle).findById(added.id)).toEqual(card)
    expect(fixture.drizzle.select().from(mediaLocations).get()?.id).toBe(location.id)
    expect(fixture.drizzle.select().from(sourceConnections).get()).toEqual(connection)
    expect(fixture.drizzle.select().from(tagsInMedia).all()).toEqual([{mediaId: added.id, metaId: 1, tagId: 1}])
    expect(fixture.drizzle.select().from(marks).get()).toMatchObject({mediaId: added.id, time: 12, text: 'My marker'})
    expect(JSON.stringify(connection)).not.toContain('token')
  })
  it('resolves the stored original independently of the compatibility path and never restores a stale location', async () => {
    const added = await importDriveFile(db, service, 'mock-video-sample')
    fixture.sqlite.prepare('UPDATE mediaLocations SET resourceKey = ? WHERE mediaId = ?').run('moved-original', added.id)
    migrateMediaLocations(fixture.sqlite)
    expect(driveLibraryFile(db, added.id).fileId).toBe('moved-original')
    expect(driveLibraryFile(db, added.id).row.path).toBe('gdrive://mock-video-sample')
    expect(fixture.drizzle.select().from(mediaLocations).all()).toHaveLength(1)
  })
})
