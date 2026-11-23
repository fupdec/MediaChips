// @vitest-environment node
import {beforeEach, afterEach, it, expect, vi} from 'vitest'
import {createTestDb, closeTestDb, type TestDb} from '../../db/testUtils/createTestDb'
import {createMediaRepository} from '../../db/repositories/media'
import {createMediaTypesRepository} from '../../db/repositories/mediaTypes'
import {createVideoMetadataRepository} from '../../db/repositories/videoMetadata'
import {createImageMetadataRepository} from '../../db/repositories/imageMetadata'
import {sourceConnections, mediaLocations} from '../../db/schema'
import type {ApiDb} from '../../types/db'
import {cloudMediaPath, type CloudProvider} from '../../../shared/cloudAccounts'
import {READ_SOURCE_CAPABILITIES} from '../../../shared/mediaSources'
import {DEFAULT_DRIVE_CONNECTION_ID, DEFAULT_DRIVE_CREDENTIAL_REF} from '../../../shared/mediaSources'
import {createCloudAdapter} from './providers'
import {fixtureRequest} from './testFixtures'
import {fillCloudMediaMetadata} from './libraryMetadata'
import {createCloudMetadataBackfill, refreshCloudMediaMetadata, CLOUD_METADATA_RETRY_MS} from './metadataBackfill'
import {importCloudFile} from './library'
import type {SourceReadAdapter, SourceObject} from '../mediaSources/adapter'

vi.mock('../mediaCacheInvalidation', () => ({invalidateMediaDerivedCaches: vi.fn()}))
let fixture: TestDb, db: ApiDb, time: number
const connectionId = '11111111-1111-4111-8111-111111111111'
const workers: ReturnType<typeof createCloudMetadataBackfill>[] = []
beforeEach(() => {
  fixture = createTestDb('cloud-metadata'); db = {...fixture, path: fixture.dbPath}; time = 1000
  for (const kind of ['video', 'audio', 'image']) createMediaTypesRepository(db.drizzle).create({name: kind, type: kind})
})
afterEach(() => { workers.splice(0).forEach(worker => worker.dispose()); closeTestDb(fixture) })
function add(provider: CloudProvider = 'gdrive', key = 'movie', kind = 'video', legacy = false) {
  const id = legacy ? DEFAULT_DRIVE_CONNECTION_ID : connectionId
  db.drizzle.insert(sourceConnections).values({id, provider, config: '{}', credentialRef: legacy ? DEFAULT_DRIVE_CREDENTIAL_REF : id, createdAt: '2026'}).onConflictDoNothing().run()
  const type = createMediaTypesRepository(db.drizzle).findByType(kind)!
  const row = createMediaRepository(db.drizzle).create({path: legacy ? `gdrive://${key}` : cloudMediaPath(provider, id, key), filesize: 10, mediaTypeId: type.id})
  db.drizzle.insert(mediaLocations).values({id: `location-${row.id}`, mediaId: row.id, connectionId: id, resourceKey: key, version: 'v1'}).run()
  return row.id
}
function adapter(metadata: SourceObject['mediaMetadata'] = {duration: 12.5, width: 1920, height: 1080}): SourceReadAdapter {
  return {provider: 'gdrive', capabilities: READ_SOURCE_CAPABILITIES, list: vi.fn(), read: vi.fn(), close: vi.fn(),
    stat: vi.fn(async key => ({resourceKey: key, name: `${key}.mp4`, contentType: 'video/mp4', size: 10, isDirectory: false, version: 'v1', mediaMetadata: metadata}))}
}
function worker(source: SourceReadAdapter, batchSize = 16) {
  const service = createCloudMetadataBackfill(db, {open: async () => source, now: () => time, batchSize})
  workers.push(service); return service
}
const meta = (id: number) => createVideoMetadataRepository(db.drizzle).findByMediaId(id)

it.each(['gdrive', 'onedrive', 'dropbox'] as const)('backfills existing %s media without reading original bytes', async provider => {
  const id = add(provider), source = adapter()
  await worker(source).tick()
  expect(meta(id)).toMatchObject({duration: 12.5, width: 1920, height: 1080})
  expect(source.read).not.toHaveBeenCalled()
  expect(source.close).toHaveBeenCalledTimes(1)
})
it('includes the legacy Google Drive connection', async () => {
  const id = add('gdrive', 'legacy', 'video', true), source = adapter()
  const open = vi.fn<typeof import('../mediaSources/context').openSource>(async () => source)
  await refreshCloudMediaMetadata(db, id, {open, now: () => time})
  expect(open.mock.calls[0][1]).toBe(DEFAULT_DRIVE_CONNECTION_ID)
  expect(meta(id)?.duration).toBe(12.5)
})
it('retries delayed provider metadata and advances past pending files', async () => {
  const first = add('gdrive', 'first'), second = add('gdrive', 'second')
  const source = adapter()
  vi.mocked(source.stat).mockImplementation(async key => ({resourceKey: key, name: `${key}.mp4`, contentType: 'video/mp4', size: 10,
    isDirectory: false, version: 'v1', mediaMetadata: key === 'first' && time < CLOUD_METADATA_RETRY_MS ? undefined : {duration: 20, width: 640, height: 360}}))
  const service = worker(source, 1)
  await service.tick(); expect(meta(first)).toBeDefined(); expect(meta(first)?.duration).toBe(0)
  await service.tick(); expect(meta(second)?.duration).toBe(20)
  await service.tick(); await service.tick(); expect(source.stat).toHaveBeenCalledTimes(2)
  time += CLOUD_METADATA_RETRY_MS
  await service.tick(); expect(meta(first)?.duration).toBe(20)
})
it('fills individual gaps and preserves known values, user tags and playback state', async () => {
  const id = add('onedrive')
  createMediaRepository(db.drizzle).updateById(id, {name: 'My name', rating: 5})
  createVideoMetadataRepository(db.drizzle).create({mediaId: id, duration: 99, width: 1280, height: 0, time: 13, codec: 'custom'})
  const source = adapter({duration: 12, width: 1920, height: 1080, codec: 'h264', bitrate: 8000, fps: 29.97})
  await worker(source).tick()
  expect(meta(id)).toMatchObject({duration: 99, width: 1280, height: 1080, time: 13, codec: 'custom', bitrate: 8000, fps: 29.97})
  expect(createMediaRepository(db.drizzle).findById(id)).toMatchObject({name: 'My name', rating: 5})
})
it('does not request unsupported codec fields for complete Drive files or process local and trashed files', async () => {
  const complete = add(), trashed = add('gdrive', 'trash')
  createVideoMetadataRepository(db.drizzle).create({mediaId: complete, duration: 20, width: 640, height: 360})
  createMediaRepository(db.drizzle).updateById(trashed, {deletedAt: '2026'})
  createMediaRepository(db.drizzle).create({path: '/local.mp4', mediaTypeId: 1})
  const source = adapter(); await worker(source).tick()
  expect(source.stat).not.toHaveBeenCalled()
})
it('continues after an offline file and waits before retrying it', async () => {
  const id = add('gdrive', 'offline'), available = add('gdrive', 'available'), source = adapter()
  vi.mocked(source.stat).mockRejectedValueOnce(new Error('offline'))
  const service = worker(source)
  await service.tick(); expect(meta(id)).toBeUndefined(); expect(meta(available)?.duration).toBe(12.5)
  await service.tick(); expect(source.stat).toHaveBeenCalledTimes(2)
  time += CLOUD_METADATA_RETRY_MS; await service.tick(); expect(meta(id)?.duration).toBe(12.5)
})
it('deduplicates concurrent inspector, prefetch and background requests', async () => {
  const id = add(), source = adapter(), open = vi.fn(async () => source)
  await Promise.all([refreshCloudMediaMetadata(db, id, {open, now: () => time}), refreshCloudMediaMetadata(db, id, {open, now: () => time}), worker(source).tick()])
  expect(source.stat).toHaveBeenCalledTimes(1)
})
it.each(['library', 'path', 'version', 'trash', 'connection'] as const)('does not commit after a %s change', async change => {
  const id = add(), source = adapter()
  const original = vi.mocked(source.stat).getMockImplementation()!
  vi.mocked(source.stat).mockImplementation(async (...args) => {
    const file = await original(...args)
    if (change === 'library') db.path = 'other'
    if (change === 'path') createMediaRepository(db.drizzle).updateById(id, {path: 'gdrive://other'})
    if (change === 'trash') createMediaRepository(db.drizzle).updateById(id, {deletedAt: '2026'})
    if (change === 'version') db.sqlite.prepare("UPDATE mediaLocations SET version = 'changed' WHERE mediaId = ?").run(id)
    if (change === 'connection') db.sqlite.prepare("UPDATE sourceConnections SET config = 'changed'").run()
    return file
  })
  await worker(source).tick().catch(() => {})
  expect(meta(id)).toBeUndefined()
})
it('rejects a replaced cloud original rather than mixing metadata from different versions', async () => {
  const id = add(), source = adapter()
  vi.mocked(source.stat).mockResolvedValue({resourceKey: 'movie', name: 'movie.mp4', contentType: 'video/mp4', size: 99, isDirectory: false, version: 'new', mediaMetadata: {duration: 500}})
  await worker(source).tick(); expect(meta(id)).toBeUndefined()
})
it('aborts active requests on disposal', async () => {
  add(); const source = adapter()
  vi.mocked(source.stat).mockImplementation((_key, signal) => new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(signal.reason), {once: true})))
  const service = worker(source), pending = service.tick()
  await vi.waitFor(() => expect(source.stat).toHaveBeenCalled())
  service.dispose(); await pending
  expect(source.close).toHaveBeenCalled()
})
it('fills image dimensions and audio fields without touching the library title', () => {
  const image = add('gdrive', 'photo', 'image'), audio = add('onedrive', 'audio', 'audio')
  fillCloudMediaMetadata(db, image, 'image', {size: 10, mediaMetadata: {width: 3000, height: 2000}})
  fillCloudMediaMetadata(db, audio, 'audio', {size: 10, mediaMetadata: {duration: 100, codec: 'aac', bitrate: 256000, title: 'Song', artist: 'Artist', album: 'Album'}})
  expect(createImageMetadataRepository(db.drizzle).findByMediaId(image)).toMatchObject({width: 3000, height: 2000})
  expect(meta(audio)).toMatchObject({duration: 100, codec: 'aac', title: 'Song', artist: 'Artist', album: 'Album'})
  expect(createMediaRepository(db.drizzle).findById(audio)?.name).not.toBe('Song')
})
it.each(['gdrive', 'onedrive', 'dropbox'] as const)('reimport fills missing %s metadata instead of leaving a zero row', async provider => {
  const {key, request} = fixtureRequest(provider)
  const source = createCloudAdapter(provider, async () => 'token', request)
  const id = add(provider, key)
  createVideoMetadataRepository(db.drizzle).create({mediaId: id, duration: 90, width: 0, height: 0, time: 8})
  await importCloudFile(db, connectionId, key, source)
  expect(meta(id)).toMatchObject({duration: 90, width: 640, height: 360, time: 8})
})
