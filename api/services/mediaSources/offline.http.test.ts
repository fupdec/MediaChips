// @vitest-environment node
import fs from 'fs'
import os from 'os'
import path from 'path'
import {Readable} from 'stream'
import type {Server} from 'http'
import express from 'express'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createTestDb, closeTestDb, type TestDb} from '../../db/testUtils/createTestDb'
import {createMediaRepository} from '../../db/repositories/media'
import type {ApiDb} from '../../types/db'
import registerSourceCatalog from '../../routes/SourceCatalog.routes'
import registerNas from '../../routes/Nas.routes'
import registerDrive from '../../routes/CloudDrive.routes'
import {createNasService} from '../nas/service'
import {createSourceCatalogService} from './catalogService'
import {READ_SOURCE_CAPABILITIES} from '../../../shared/mediaSources'
import type {SourceReadAdapter} from './adapter'

const connectionId = '11111111-1111-4111-8111-111111111111'
describe('offline original HTTP playback', () => {
  let fixture: TestDb, db: ApiDb, directory: string, service: ReturnType<typeof createSourceCatalogService>
  let server: Server, app: ReturnType<typeof express>, base: string, adapter: SourceReadAdapter
  let id: number
  const remote = vi.fn(async () => { throw new Error('Offline: do not open the source') })
  beforeEach(async () => {
    fixture = createTestDb('offline-http'); db = {...fixture, path: fixture.dbPath}
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-offline-http-'))
    vi.stubEnv('MEDIA_CHIPS_DATA_DIR', directory)
    fixture.sqlite.exec(`INSERT INTO sourceConnections (id, provider, config, credentialRef, createdAt) VALUES ('${connectionId}', 'nas', '{}', 'secret', '2026');
      INSERT INTO mediaTypes (id, type, name, createdAt, updatedAt) VALUES (1, 'video', 'Videos', '2026', '2026');`)
    const file = {resourceKey: 'video', name: 'film.mp4', version: 'v1', size: 10, isDirectory: false, contentType: 'video/mp4'}
    adapter = {provider: 'nas', capabilities: READ_SOURCE_CAPABILITIES, list: vi.fn(async () => ({entries: [file]})),
      stat: vi.fn(async () => file), read: vi.fn(async () => ({status: 200, headers: {}, body: Readable.from([Buffer.from('0123456789')])})), close: vi.fn()}
    service = createSourceCatalogService(db, {open: async () => adapter})
    const root = service.saveRoot({connectionId, rootKey: '', intervalMinutes: 0, name: 'Test'})
    const scan = service.refresh(root.id)
    await vi.waitFor(() => expect(service.job(scan.id).state).toBe('completed'))
    id = createMediaRepository(db.drizzle).findAllRaw()[0].id
    const offline = service.saveOffline(id)
    await vi.waitFor(() => expect(service.job(offline.id).state).toBe('completed'))
    app = express(); app.use(express.json()); registerSourceCatalog(app, db, service)
    registerNas(app, db, createNasService({connect: remote}))
    registerDrive(app, db)
    server = await new Promise((resolve, reject) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); listener.once('error', reject) })
    base = `http://127.0.0.1:${(server.address() as {port: number}).port}`
  })
  afterEach(async () => {
    app.emit('source-catalog:dispose')
    if (server) await new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) })
    closeTestDb(fixture); fs.rmSync(directory, {recursive: true, force: true}); vi.unstubAllEnvs(); remote.mockClear()
  })
  const url = () => `${base}/api/source-catalog/media/${id}/offline/stream`

  it('serves full bodies, ranges, suffixes and HEAD while NAS is disconnected', async () => {
    fixture.sqlite.exec("UPDATE mediaLocations SET availability = 'unavailable'")
    const plan = await (await fetch(`${base}/api/nas/media/${id}/playable`)).json()
    expect(plan.url).toBe(`/api/source-catalog/media/${id}/offline/stream`)
    const full = await fetch(url()); expect(full.status).toBe(200); expect(await full.text()).toBe('0123456789')
    const partial = await fetch(url(), {headers: {Range: 'bytes=2-5'}})
    expect(partial.status).toBe(206); expect(partial.headers.get('content-range')).toBe('bytes 2-5/10'); expect(await partial.text()).toBe('2345')
    const suffix = await fetch(url(), {headers: {Range: 'bytes=-3'}})
    expect(suffix.status).toBe(206); expect(await suffix.text()).toBe('789')
    const head = await fetch(url(), {method: 'HEAD'}); expect(head.headers.get('content-length')).toBe('10'); expect(await head.text()).toBe('')
    expect(remote).not.toHaveBeenCalled()
  })

  it('uses the offline copy for Drive playback and image/download stream routes before authentication', async () => {
    fixture.sqlite.exec("UPDATE sourceConnections SET provider = 'gdrive'; UPDATE mediaLocations SET resourceKey = 'drive-file'; UPDATE media SET path = 'gdrive://drive-file'")
    // Drive resolution uses its stable default connection identity.
    fixture.sqlite.exec(`PRAGMA foreign_keys = OFF; UPDATE sourceConnections SET id = 'google-drive'; UPDATE mediaLocations SET connectionId = 'google-drive'; PRAGMA foreign_keys = ON;`)
    const plan = await fetch(`${base}/api/drive/media/${id}/playable`)
    expect(plan.status).toBe(200); expect((await plan.json()).url).toContain('/offline/stream')
    const stream = await fetch(`${base}/api/drive/files/drive-file/stream`, {headers: {Range: 'bytes=0-1'}})
    expect(stream.status).toBe(206); expect(await stream.text()).toBe('01')
  })

  it('serves a saved NAS image with an unversioned catalog path without connecting', async () => {
    const imagePath = `nas://${connectionId}/photo.jpg`
    fixture.sqlite.prepare('UPDATE media SET path = ? WHERE id = ?').run(imagePath, id)
    fixture.sqlite.exec("UPDATE mediaLocations SET resourceKey = 'photo.jpg'; UPDATE offlineCopies SET contentType = 'image/jpeg'")
    const image = await fetch(`${base}/api/nas/image?path=${encodeURIComponent(imagePath)}`)
    expect(image.status).toBe(200); expect(image.headers.get('content-type')).toBe('image/jpeg')
    expect(await image.text()).toBe('0123456789')
    expect(remote).not.toHaveBeenCalled()
  })

  it('refuses stale, missing or trashed copies and validates request payloads', async () => {
    fixture.sqlite.exec("UPDATE mediaLocations SET version = 'v2'")
    const stale = await fetch(url()); expect(stale.status).toBe(409); expect((await stale.json()).code).toBe('offline_copy_stale')
    fixture.sqlite.exec("UPDATE media SET deletedAt = '2026'")
    expect((await fetch(url())).status).toBe(404)
    expect((await fetch(`${base}/api/source-catalog/cache`, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({limitBytes: -1})})).status).toBe(400)
    expect((await fetch(`${base}/api/source-catalog/roots`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({connectionId, rootKey: '../escape', intervalMinutes: 1})})).status).toBe(400)
  })
})
