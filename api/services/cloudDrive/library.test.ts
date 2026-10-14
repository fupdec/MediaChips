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
  it('stores remote identity, deduplicates and marks the listing without downloading', async () => {
    const download = vi.spyOn(service.transport, 'downloadFile')
    const added = await importDriveFile(db, service, 'mock-video-sample')
    expect(added.created).toBe(true)
    expect(await importDriveFile(db, service, 'mock-video-sample')).toEqual({...added, created: false})
    const {row, fileId} = driveLibraryFile(db, added.id)
    expect(row.path).toBe(driveMediaPath(fileId))
    expect(isRemoteMediaPath(row.path)).toBe(true)
    expect(download).not.toHaveBeenCalled()
    const listed = await listDriveFolder(db, service, 'root')
    expect(listed.files.find(file => file.id === fileId)?.mediaId).toBe(added.id)
    expect(await collectMissingMediaByPathExist([{id: row.id, path: row.path}], {pathExists: async () => false})).toEqual([])
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
})
