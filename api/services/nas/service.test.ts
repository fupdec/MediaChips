// @vitest-environment node
import fs from 'fs'
import os from 'os'
import path from 'path'
import {Readable} from 'stream'
import express from 'express'
import type {Server} from 'http'
import {beforeEach, afterEach, describe, it, expect, vi} from 'vitest'
import {createTestDb, closeTestDb, type TestDb} from '../../db/testUtils/createTestDb'
import {createMediaTypesRepository} from '../../db/repositories/mediaTypes'
import {createMediaRepository} from '../../db/repositories/media'
import {mediaLocations, sourceConnections} from '../../db/schema/mediaSources'
import {media} from '../../db/schema/media'
import {videoMetadata} from '../../db/schema/videoMetadata'
import {mergeMediaItemsTx} from '../mediaMerge'
import {collectMissingMediaByPathExist} from '../missingMediaExistScan'
import type {ApiDb} from '../../types/db'
import {createNasCredentialStore} from './credentials'
import {createNasService, parseNasRange} from './service'
import {connectNas, normalizeNasRelativePath, type NasTransport} from './transport'
import registerNas from '../../routes/Nas.routes'

vi.mock('../mediaCacheInvalidation', () => ({invalidateMediaDerivedCaches: vi.fn()}))
const config = {name: 'Test NAS', protocol: 'sftp' as const, host: 'nas.example', port: 22, username: 'reader', root: '/videos', password: 'do-not-expose'}
const bytes = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz')

describe('NAS ranges and path boundaries', () => {
  it('handles prefix, suffix and open-ended ranges, clamps the end and rejects invalid requests', () => {
    expect(parseNasRange('bytes=2-5', 10)).toEqual({start: 2, end: 5, partial: true})
    expect(parseNasRange('bytes=-3', 10)).toEqual({start: 7, end: 9, partial: true})
    expect(parseNasRange('bytes=7-', 10)).toEqual({start: 7, end: 9, partial: true})
    expect(parseNasRange('bytes=2-999', 10)?.end).toBe(9)
    for (const range of ['bytes=10-', 'bytes=4-2', 'bytes=-0', 'bytes=1-2,4-5', 'bytes=-', 'bytes=9007199254740992-']) expect(parseNasRange(range, 10)).toBeNull()
    expect(parseNasRange('bytes=0-', 0)).toBeNull()
  })
  it('rejects traversal and protocol command injection while keeping Unicode and spaces', () => {
    expect(normalizeNasRelativePath('Кино/video 1.mp4')).toBe('Кино/video 1.mp4')
    for (const value of ['/etc/passwd', '../video.mp4', 'a/../b', 'a\\b', 'movie\r\nDELE x', 'a/./b']) expect(() => normalizeNasRelativePath(value)).toThrow()
  })
})

describe('NAS library and HTTP playback', () => {
  let fixture: TestDb
  let db: ApiDb
  let directory: string
  let server: Server
  let base: string
  let modifiedAt: number
  let closed: number
  let service: ReturnType<typeof createNasService>
  let connect: ReturnType<typeof vi.fn<typeof connectNas>>
  beforeEach(async () => {
    fixture = createTestDb('nas')
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-nas-vault-'))
    db = {...fixture, path: directory, config: {id: 'test-library'}}
    createMediaTypesRepository(fixture.drizzle).create({name: 'Videos', type: 'video'})
    modifiedAt = 1000; closed = 0
    connect = vi.fn(async (): Promise<NasTransport> => ({
      async list() { return [{name: 'video.mp4', path: 'video.mp4', size: bytes.length, modifiedAt, isDirectory: false}] },
      async stat() { return {size: bytes.length, modifiedAt, isDirectory: false} },
      async read(_path, start, end) { return Readable.from([bytes.subarray(start, end + 1)]) },
      close() { closed++ },
    }))
    service = createNasService({connect, credentials: createNasCredentialStore(directory)})
    const app = express(); app.use(express.json()); registerNas(app, db, service)
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
    base = `http://127.0.0.1:${(server.address() as {port: number}).port}`
  })
  afterEach(async () => {
    await new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) })
    closeTestDb(fixture); fs.rmSync(directory, {recursive: true, force: true})
  })
  const add = async (db: ApiDb, service: ReturnType<typeof createNasService>) => {
    const connection = await service.saveConnection(db, config)
    const item = await service.importFile(db, connection.id, 'video.mp4')
    return {connection, item}
  }

  it.each(['preview', 'library'])('closes a pending %s connection when the player cancels preparation', async mode => {
    const {connection, item} = await add(db, service)
    let signal!: AbortSignal
    connect.mockImplementationOnce(async (_config, _credentials, pendingSignal) => {
      signal = pendingSignal!
      return await new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {once: true})
      })
    })
    const controller = new AbortController()
    const url = mode === 'preview' ? `/api/nas/connections/${connection.id}/playable?path=video.mp4` : `/api/nas/media/${item.id}/playable`
    const request = fetch(base + url, {signal: controller.signal})
    const rejection = expect(request).rejects.toMatchObject({name: 'AbortError'})
    await vi.waitFor(() => expect(signal).toBeDefined())
    controller.abort()
    await rejection
    await vi.waitFor(() => expect(signal.aborted).toBe(true))
    expect((await fetch(base + url)).status).toBe(200)
  })
  it('previews a remote file with range requests without creating media, locations or metadata', async () => {
    const connection = await service.saveConnection(db, config)
    const response = await fetch(base + `/api/nas/connections/${connection.id}/playable?path=video.mp4`)
    expect(response.status).toBe(200)
    const plan = await response.json()
    expect(plan.title).toBe('video.mp4')
    expect(JSON.stringify(plan)).not.toMatch(/nas\.example|do-not-expose/)
    const stream = await fetch(base + plan.url, {headers: {Range: 'bytes=4-9'}})
    expect(stream.status).toBe(206)
    expect(stream.headers.get('content-range')).toBe(`bytes 4-9/${bytes.length}`)
    expect(await stream.text()).toBe('456789')
    const head = await fetch(base + plan.url, {method: 'HEAD'})
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
    expect(fixture.drizzle.select().from(media).all()).toHaveLength(0)
    expect(fixture.drizzle.select().from(mediaLocations).all()).toHaveLength(0)
    expect(fixture.drizzle.select().from(videoMetadata).all()).toHaveLength(0)
  })
  it('scopes preview tickets to the connection and library, rejects changed files and disconnects', async () => {
    const connection = await service.saveConnection(db, config)
    const plan = await service.preparePreview(db, connection.id, 'video.mp4')
    expect((await fetch(base + plan.url.replace(connection.id, '11111111-1111-4111-8111-111111111111'))).status).toBe(410)
    expect((await fetch(base + plan.url.replace(`/connections/${connection.id}`, '/media/1'))).status).toBe(410)
    db.path = '/other-library'
    expect((await fetch(base + plan.url)).status).toBe(410)
    db.path = directory
    modifiedAt++
    expect((await fetch(base + plan.url)).status).toBe(409)
    const refreshed = await service.preparePreview(db, connection.id, 'video.mp4')
    expect((await fetch(base + refreshed.url)).status).toBe(200)
    service.disconnect(db, connection.id)
    expect((await fetch(base + refreshed.url)).status).toBe(410)
    expect(fixture.drizzle.select().from(media).all()).toHaveLength(0)
  })
  it('validates preview paths and file types before opening the remote connection', async () => {
    const connection = await service.saveConnection(db, config)
    connect.mockClear()
    for (const input of ['../outside.mp4', '/outside.mp4', 'notes.txt']) {
      const response = await fetch(base + `/api/nas/connections/${connection.id}/playable?path=${encodeURIComponent(input)}`)
      expect(response.status).toBeGreaterThanOrEqual(400)
    }
    expect(connect).not.toHaveBeenCalled()
    connect.mockImplementationOnce(async () => ({stat: vi.fn(async () => ({size: 10, isDirectory: true})),
      list: vi.fn(), read: vi.fn(), close: vi.fn()}))
    await expect(service.preparePreview(db, connection.id, 'directory.mp4')).rejects.toMatchObject({code: 'invalid_file'})
  })
  it('keeps credentials out of API responses and SQLite and encrypts them outside the library', async () => {
    const connection = await service.saveConnection(db, config)
    expect(JSON.stringify(service.connections(db))).not.toContain(config.password)
    expect(JSON.stringify(fixture.drizzle.select().from(sourceConnections).all())).not.toContain(config.password)
    const encrypted = fs.readdirSync(directory).find(n => n.endsWith('.enc'))!
    expect(fs.readFileSync(path.join(directory, encrypted)).includes(Buffer.from(config.password))).toBe(false)
    expect(connection.hasCredentials).toBe(true)
    if (process.platform !== 'win32') expect(fs.statSync(path.join(directory, 'master.key')).mode & 0o777).toBe(0o600)
  })
  it.each(['sftp', 'ftp', 'ftps'] as const)('preserves the saved %s password and vault file when editing without a new password', async protocol => {
    const connection = await service.saveConnection(db, {...config, protocol})
    const encrypted = path.join(directory, fs.readdirSync(directory).find(n => n.endsWith('.enc'))!)
    const original = fs.readFileSync(encrypted)
    const {password: _password, ...unchanged} = {...config, protocol}
    for (const password of [undefined, '']) {
      const response = await fetch(base + `/api/nas/connections/${connection.id}`, {
        method: 'PUT', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...unchanged, name: 'Renamed NAS', password}),
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({name: 'Renamed NAS', hasPassword: true, hasPrivateKey: false})
      expect(connect.mock.calls.at(-1)?.[1]).toEqual({password: config.password})
      expect(fs.readFileSync(encrypted)).toEqual(original)
    }
  })
  it('replaces credentials only after a successful check and never returns the password', async () => {
    const connection = await service.saveConnection(db, config)
    const row = fixture.drizzle.select().from(sourceConnections).get()!
    const vault = createNasCredentialStore(directory)
    connect.mockRejectedValueOnce(new Error('Login failed'))
    await expect(service.saveConnection(db, {...config, password: 'incorrect'}, connection.id)).rejects.toThrow()
    expect(vault.get(row.credentialRef)).toEqual({password: config.password})
    const updated = await service.saveConnection(db, {...config, password: 'replacement'}, connection.id)
    expect(vault.get(row.credentialRef)).toEqual({password: 'replacement'})
    expect(updated).toMatchObject({hasCredentials: true, hasPassword: true, hasPrivateKey: false})
    expect(updated).not.toHaveProperty('password')
    service.disconnect(db, connection.id)
    expect(service.connections(db)[0]).toMatchObject({hasCredentials: false, hasPassword: false, hasPrivateKey: false})
  })
  it('preserves an existing SSH key and passphrase when editing with blank secret fields', async () => {
    const {password: _password, ...keyConfig} = config
    const connection = await service.saveConnection(db, {...keyConfig, privateKey: 'private-key', passphrase: 'key-passphrase'})
    const encrypted = path.join(directory, fs.readdirSync(directory).find(n => n.endsWith('.enc'))!)
    const original = fs.readFileSync(encrypted)
    expect(connection).toMatchObject({hasPassword: false, hasPrivateKey: true})
    const updated = await service.saveConnection(db, {...keyConfig, name: 'Renamed', password: '', privateKey: '', passphrase: ''}, connection.id)
    expect(connect.mock.calls.at(-1)?.[1]).toEqual({privateKey: 'private-key', passphrase: 'key-passphrase'})
    expect(fs.readFileSync(encrypted)).toEqual(original)
    expect(updated).not.toHaveProperty('privateKey')
    expect(updated).not.toHaveProperty('passphrase')
  })
  it('reports existing file versions for browser badges and exposes changed versions as new files', async () => {
    const {connection, item} = await add(db, service)
    const response = await fetch(base + `/api/nas/connections/${connection.id}/files?path=`)
    expect(response.status).toBe(200)
    expect((await response.json()).entries[0]).toMatchObject({path: 'video.mp4', mediaId: item.id, modifiedAt})
    modifiedAt++
    expect((await service.list(db, connection.id, '')).entries[0].mediaId).toBeNull()
    const changed = await service.importFile(db, connection.id, 'video.mp4')
    expect((await service.list(db, connection.id, '')).entries[0].mediaId).toBe(changed.id)
    createMediaRepository(fixture.drizzle).deleteById(changed.id)
    expect((await service.list(db, connection.id, '')).entries[0].mediaId).toBeNull()
  })
  it('imports idempotently, retains local identities and does not classify NAS entries as lost files', async () => {
    const local = createMediaRepository(fixture.drizzle).create({path: '/local/video.mp4'})
    const {connection, item} = await add(db, service)
    expect((await service.importFile(db, connection.id, 'video.mp4')).id).toBe(item.id)
    expect(fixture.drizzle.select().from(mediaLocations).all()).toHaveLength(1)
    const row = createMediaRepository(fixture.drizzle).findById(item.id)!
    const exists = vi.fn(async () => false)
    expect(await collectMissingMediaByPathExist([row], {pathExists: exists})).toEqual([])
    expect(exists).not.toHaveBeenCalled()
    expect(createMediaRepository(fixture.drizzle).findById(local.id)?.path).toBe('/local/video.mp4')
  })
  it('imports a batch over one connection and keeps duplicates and file failures independent', async () => {
    const {connection, item} = await add(db, service)
    connect.mockClear()
    connect.mockImplementationOnce(async () => ({
      async stat(input) {
        if (input === 'missing.mp4') throw new Error('Permission denied with internal server details')
        return {size: bytes.length, modifiedAt, isDirectory: false}
      }, list: vi.fn(), read: vi.fn(), close: vi.fn(),
    }))
    const response = await fetch(base + '/api/nas/import-batch', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({connectionId: connection.id, paths: ['video.mp4', 'missing.mp4', 'second.mp4', '../bad.mp4', 'notes.txt']})})
    expect(response.status).toBe(200)
    const {results} = await response.json()
    expect(results[0]).toMatchObject({ok: true, id: item.id, created: false})
    expect(results[1]).toMatchObject({ok: false, code: 'connection_failed'})
    expect(results[2]).toMatchObject({ok: true, created: true})
    expect(results[3]).toMatchObject({ok: false, code: 'invalid_path'})
    expect(results[4]).toMatchObject({ok: false, code: 'unsupported_format'})
    expect(JSON.stringify(results)).not.toMatch(/do-not-expose|internal server details/)
    expect(connect).toHaveBeenCalledTimes(1)
    expect(fixture.drizzle.select().from(mediaLocations).all()).toHaveLength(2)
    expect((await service.importFiles(db, connection.id, ['second.mp4', 'second.mp4'])).results).toHaveLength(1)
  })
  it('stops a batch before writing a late file after switching libraries or cancellation', async () => {
    const {connection} = await add(db, service)
    connect.mockImplementationOnce(async () => ({
      async stat(input) {
        if (input === 'late.mp4') db.path = '/other-library'
        return {size: bytes.length, modifiedAt, isDirectory: false}
      }, list: vi.fn(), read: vi.fn(), close: vi.fn(),
    }))
    await expect(service.importFiles(db, connection.id, ['first.mp4', 'late.mp4', 'last.mp4'])).rejects.toMatchObject({code: 'library_changed'})
    expect(fixture.drizzle.select().from(mediaLocations).all().map(row => row.resourceKey)).toEqual(['video.mp4', 'first.mp4'])
    db.path = directory
    const controller = new AbortController()
    connect.mockImplementationOnce(async () => ({
      async stat() { controller.abort(); return {size: bytes.length, modifiedAt, isDirectory: false} },
      list: vi.fn(), read: vi.fn(), close: vi.fn(),
    }))
    await expect(service.importFiles(db, connection.id, ['cancelled.mp4'], controller.signal)).rejects.toMatchObject({code: 'cancelled'})
    expect(fixture.drizzle.select().from(mediaLocations).all()).toHaveLength(2)
  })
  it('validates batch request bounds before opening a NAS connection', async () => {
    const {connection} = await add(db, service)
    connect.mockClear()
    for (const paths of [[], Array.from({length: 21}, (_, index) => `${index}.mp4`)]) {
      const response = await fetch(base + '/api/nas/import-batch', {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({connectionId: connection.id, paths})})
      expect(response.status).toBe(400)
    }
    expect(connect).not.toHaveBeenCalled()
  })
  it('streams exact bytes with 206, suffix ranges, HEAD, ETag and 416 without leaking credentials', async () => {
    const {item} = await add(db, service)
    const plan = await service.prepare(db, item.id)
    expect(JSON.stringify(plan)).not.toMatch(/nas\.example|do-not-expose/)
    const response = await fetch(base + plan.url, {headers: {Range: 'bytes=4-9'}})
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe(`bytes 4-9/${bytes.length}`)
    expect(response.headers.get('content-length')).toBe('6')
    expect(await response.text()).toBe('456789')
    const suffix = await fetch(base + plan.url, {headers: {Range: 'bytes=-3'}})
    expect(await suffix.text()).toBe('xyz')
    const head = await fetch(base + plan.url, {method: 'HEAD'})
    expect(head.status).toBe(200); expect(await head.text()).toBe('')
    const invalid = await fetch(base + plan.url, {headers: {Range: 'bytes=999-'}})
    expect(invalid.status).toBe(416)
    expect(invalid.headers.get('content-range')).toBe(`bytes */${bytes.length}`)
    const stale = await fetch(base + plan.url, {headers: {Range: 'bytes=4-9', 'If-Range': '"old"'}})
    expect(stale.status).toBe(200); expect(await stale.text()).toBe(bytes.toString())
    expect(closed).toBeGreaterThanOrEqual(6)
  })
  it('disconnects without losing media and invalidates playback sessions', async () => {
    const {connection, item} = await add(db, service)
    const plan = await service.prepare(db, item.id)
    service.disconnect(db, connection.id)
    expect((await fetch(base + plan.url)).status).toBe(410)
    expect(service.connections(db)[0].hasCredentials).toBe(false)
    expect(createMediaRepository(fixture.drizzle).findById(item.id)).toBeTruthy()
    await service.saveConnection(db, config, connection.id)
    expect((await service.importFile(db, connection.id, 'video.mp4')).id).toBe(item.id)
  })
  it('rejects playback tickets after the card is retargeted and malformed request IDs', async () => {
    const {item} = await add(db, service)
    const plan = await service.prepare(db, item.id)
    createMediaRepository(fixture.drizzle).updateById(item.id, {path: '/local/replacement.mp4'})
    expect((await fetch(base + plan.url)).status).toBe(410)
    expect((await fetch(base + '/api/nas/media/not-a-number/playable')).status).toBe(400)
    expect((await fetch(base + '/api/nas/connections/not-a-uuid/files')).status).toBe(400)
  })
  it('creates a new card for a changed file and rejects old sessions so marker timing is preserved', async () => {
    const {connection, item} = await add(db, service)
    const plan = await service.prepare(db, item.id)
    modifiedAt++
    const changed = await fetch(base + plan.url)
    expect(changed.status).toBe(409)
    expect((await changed.json()).code).toBe('file_changed')
    const next = await service.importFile(db, connection.id, 'video.mp4')
    expect(next.id).not.toBe(item.id)
    expect(fixture.drizzle.select().from(mediaLocations).all()).toHaveLength(2)
    await expect(service.prepare(db, item.id)).rejects.toMatchObject({code: 'file_changed'})
    expect((await service.prepare(db, next.id)).url).toContain(`/media/${next.id}/stream`)
  })
  it('rejects session reuse after a library switch and late import results', async () => {
    const {connection, item} = await add(db, service)
    const plan = await service.prepare(db, item.id)
    db.path = '/other-library'
    expect((await fetch(base + plan.url)).status).toBe(410)
    db.path = directory
    connect.mockImplementationOnce(async () => ({
      async stat() { db.path = '/other-library'; return {size: bytes.length, modifiedAt, isDirectory: false} },
      list: vi.fn(), read: vi.fn(), close: vi.fn(),
    }))
    await expect(service.importFile(db, connection.id, 'different.mp4')).rejects.toMatchObject({code: 'library_changed'})
    expect(fixture.drizzle.select().from(mediaLocations).all()).toHaveLength(1)
  })
  it('retains remote locations when media are merged and cascades them on final removal', async () => {
    const {item} = await add(db, service)
    const local = createMediaRepository(fixture.drizzle).create({path: '/local/video.mp4', mediaTypeId: createMediaRepository(fixture.drizzle).findById(item.id)!.mediaTypeId})
    fixture.drizzle.transaction(tx => mergeMediaItemsTx(tx, {survivorId: local.id, sourceIds: [item.id]}))
    expect(fixture.drizzle.select().from(mediaLocations).get()?.mediaId).toBe(local.id)
    createMediaRepository(fixture.drizzle).deleteById(local.id)
    expect(fixture.drizzle.select().from(mediaLocations).all()).toHaveLength(0)
    expect(fixture.drizzle.select().from(sourceConnections).all()).toHaveLength(1)
  })
})
