// @vitest-environment node
import fs from 'fs'
import os from 'os'
import path from 'path'
import express from 'express'
import type {Server} from 'http'
import {beforeEach, afterEach, describe, it, expect, vi} from 'vitest'
import {createTestDb, closeTestDb, type TestDb} from '../../db/testUtils/createTestDb'
import {createMediaTypesRepository} from '../../db/repositories/mediaTypes'
import {createMediaRepository} from '../../db/repositories/media'
import {mediaLocations, sourceConnections} from '../../db/schema/mediaSources'
import type {ApiDb} from '../../types/db'
import {createNasCredentialStore} from './credentials'
import {createNasService} from './service'
import registerNas from '../../routes/Nas.routes'
import registerMedia from '../../routes/Media.routes'

vi.mock('../mediaCacheInvalidation', () => ({invalidateMediaDerivedCaches: vi.fn()}))
const relative = 'Кино & тест/video 100% #.mp4'
// Opt in after scripts/webdav-fixture/setup.mjs; never treat mocks as interoperability evidence.
describe.skipIf(process.env.WEBDAV_ACCEPTANCE !== '1')('WebDAV interoperability with real servers', () => {
  let fixture: TestDb
  let db: ApiDb
  let directory: string
  let server: Server
  let base: string
  beforeEach(async () => {
    fixture = createTestDb('webdav-acceptance')
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-webdav-library-'))
    db = {...fixture, path: directory, config: {id: 'webdav-acceptance'}}
    for (const type of ['video', 'audio', 'image']) createMediaTypesRepository(fixture.drizzle).create({name: type, type})
    const service = createNasService({credentials: createNasCredentialStore(directory)})
    const app = express(); app.use(express.json()); registerNas(app, db, service); registerMedia(app, db)
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
    base = `http://127.0.0.1:${(server.address() as {port: number}).port}`
  })
  afterEach(async () => {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
    closeTestDb(fixture); fs.rmSync(directory, {recursive: true, force: true})
  })
  it.each([
    ['Nextcloud 32 (SabreDAV)', 18443, '/remote.php/dav/files/reader/'],
    ['Apache mod_dav', 18444, '/dav/'],
  ] as const)('%s: connect → browse/stat → preview → import → edit metadata → play/seek/download → reconnect', async (name, port, root) => {
    const post = (url: string, body: unknown, method = 'POST') => fetch(base + url, {method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)})
    const config = {name, protocol: 'webdav', host: '127.0.0.1', port, root, username: 'reader', password: 'webdav-acceptance-password'}
    const connected = await post('/api/nas/connections', config)
    expect(connected.status, await connected.clone().text()).toBe(200)
    const connection = await connected.json()
    expect(connection).toMatchObject({protocol: 'webdav', hasPassword: true, capabilities: {view: true, seek: true, download: true, move: false, delete: false}})
    expect(JSON.stringify(connection)).not.toContain(config.password)
    const rootListing = await fetch(`${base}/api/nas/connections/${connection.id}/files`)
    expect((await rootListing.json()).entries).toContainEqual(expect.objectContaining({name: 'Кино & тест', isDirectory: true}))
    const listUrl = `${base}/api/nas/connections/${connection.id}/files?path=${encodeURIComponent('Кино & тест')}`
    const listing = await (await fetch(listUrl)).json()
    const entry = listing.entries.find((entry: {path: string}) => entry.path === relative)
    expect(entry).toMatchObject({isDirectory: false, mediaId: null})
    expect(entry.size).toBeGreaterThan(0)
    expect(entry.modifiedAt).toBeGreaterThan(0)
    expect(entry.etag).toBeTruthy()
    const original = fs.readFileSync(path.resolve('.cache/webdav-acceptance/files', relative))
    expect(entry.size).toBe(original.length)
    const preview = await (await fetch(`${base}/api/nas/connections/${connection.id}/playable?path=${encodeURIComponent(relative)}`)).json()
    const previewStream = await fetch(base + preview.url, {headers: {Range: 'bytes=16-47'}})
    expect(previewStream.status).toBe(206)
    expect(Buffer.from(await previewStream.arrayBuffer())).toEqual(original.subarray(16, 48))
    expect(fixture.drizzle.select().from(mediaLocations).all()).toHaveLength(0)
    const batch = await post('/api/nas/import-batch', {connectionId: connection.id, paths: [relative]})
    const item = (await batch.json()).results[0]
    expect(item).toMatchObject({ok: true, created: true})
    const duplicate = await (await post('/api/nas/import', {connectionId: connection.id, path: relative})).json()
    expect(duplicate).toMatchObject({id: item.id, created: false})
    expect((await (await fetch(listUrl)).json()).entries[0].mediaId).toBe(item.id)
    const saved = await post(`/api/Media/${item.id}`, {name: `${name} edited`, bookmark: 'WebDAV acceptance metadata', rating: 4, favorite: true}, 'PUT')
    expect(saved.status, await saved.clone().text()).toBe(200)
    expect(createMediaRepository(fixture.drizzle).findById(item.id)).toMatchObject({name: `${name} edited`, bookmark: 'WebDAV acceptance metadata', rating: 4, favorite: true})
    const plan = await (await fetch(`${base}/api/nas/media/${item.id}/playable`)).json()
    const full = await fetch(base + plan.url)
    expect(full.status).toBe(200)
    expect(Buffer.from(await full.arrayBuffer())).toEqual(original)
    const seek = await fetch(base + plan.url, {headers: {Range: `bytes=${original.length - 1024}-`}})
    expect(seek.status).toBe(206)
    expect(seek.headers.get('content-range')).toBe(`bytes ${original.length - 1024}-${original.length - 1}/${original.length}`)
    expect(Buffer.from(await seek.arrayBuffer())).toEqual(original.subarray(-1024))
    const head = await fetch(base + plan.url, {method: 'HEAD'})
    expect(head.status).toBe(200); expect(head.headers.get('content-length')).toBe(String(original.length))
    expect((await fetch(base + plan.url, {headers: {Range: 'bytes=999999999-'}})).status).toBe(416)
    const download = await fetch(base + plan.url + '&download=1')
    expect(download.headers.get('content-disposition')).toContain('attachment;')
    expect(Buffer.from(await download.arrayBuffer())).toEqual(original)
    const row = fixture.drizzle.select().from(sourceConnections).get()!
    expect(row.config).not.toContain(config.password)
    const edit = await post(`/api/nas/connections/${connection.id}`, {...config, name: `${name} renamed`, password: ''}, 'PUT')
    expect(edit.status).toBe(200)
    expect((await edit.json()).hasPassword).toBe(true)
    await post(`/api/nas/connections/${connection.id}/disconnect`, {})
    expect((await fetch(base + plan.url)).status).toBe(410)
    expect(createMediaRepository(fixture.drizzle).findById(item.id)?.bookmark).toBe('WebDAV acceptance metadata')
    expect((await post(`/api/nas/connections/${connection.id}`, config, 'PUT')).status).toBe(200)
    expect((await (await post('/api/nas/import', {connectionId: connection.id, path: relative})).json()).id).toBe(item.id)
    expect((await fetch(`${base}/api/nas/media/${item.id}/playable`)).status).toBe(200)
  }, 60_000)
})
