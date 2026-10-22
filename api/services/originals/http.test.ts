// @vitest-environment node
import fs from 'fs'
import os from 'os'
import path from 'path'
import express from 'express'
import type {Server} from 'http'
import {beforeEach, afterEach, describe, expect, it, vi} from 'vitest'
import {createTestDb, closeTestDb, type TestDb} from '../../db/testUtils/createTestDb'
import {createMediaRepository} from '../../db/repositories/media'
import {createOriginalOperationsService} from './service'
import registerOriginalOperations from '../../routes/OriginalOperations.routes'
import type {OriginalJob} from '../../../shared/originalOperations'
vi.mock('../mediaCacheInvalidation', () => ({invalidateMediaDerivedCaches: vi.fn()}))
let fixture: TestDb, directory: string, base: string, server: Server, app: ReturnType<typeof express>, id: number
let service: ReturnType<typeof createOriginalOperationsService>
beforeEach(async () => {
  fixture = createTestDb('original-http'); directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-original-http-'))
  const db = {...fixture, path: fixture.dbPath}
  fs.writeFileSync(path.join(directory, 'old.mp4'), 'original')
  id = createMediaRepository(db.drizzle).create({path: path.join(directory, 'old.mp4'), name: 'My title', rating: 4}).id
  createMediaRepository(db.drizzle).updateById(id, {rating: 4})
  service = createOriginalOperationsService(db, {directory: path.join(directory, 'spool')})
  app = express(); app.use(express.json()); registerOriginalOperations(app, db, service)
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  base = `http://127.0.0.1:${(server.address() as {port: number}).port}/api/original-operations`
})
afterEach(async () => { app.emit('original-operations:dispose'); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); closeTestDb(fixture); fs.rmSync(directory, {recursive: true, force: true}) })
const post = (url: string, body: unknown) => fetch(base + url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)})
async function done(id: string) { let job: OriginalJob; await vi.waitFor(async () => { job = await (await fetch(base + '/jobs/' + id)).json(); expect(job.state).toBe('completed') }); return job! }
describe('original operations HTTP contract', () => {
  it('keeps saved Drive session URLs private, including nested transfer uploads', async () => {
    const job: OriginalJob = {id: '00000000-0000-4000-8000-000000000001', createdAt: '2026', state: 'failed', items: [{id: 'copy', kind: 'transfer',
      conflict: 'fail', phase: 'prepared', state: 'failed', bytes: 2, total: 4, transfer: {upload: {id: 'child', kind: 'upload',
        conflict: 'fail', phase: 'mutating', state: 'running', bytes: 2, total: 4,
        drive: {fileId: 'reserved', parentId: 'root', name: 'file', uploadSession: 'https://www.googleapis.com/upload/drive/private-session'}}}}]}
    fixture.sqlite.prepare('INSERT INTO originalOperationJobs (id,payload) VALUES (?,?)').run(job.id, JSON.stringify(job))
    const single = await (await fetch(base + '/jobs/' + job.id)).json()
    const list = await (await fetch(base + '/jobs')).json()
    expect(single.items[0].transfer.upload.drive.uploadSession).toBeUndefined()
    expect(JSON.stringify(list)).not.toContain('private-session')
    expect((fixture.sqlite.prepare('SELECT payload FROM originalOperationJobs WHERE id = ?').get(job.id) as {payload: string}).payload).toContain('private-session')
  })
  it('lists transfer destinations without connection secrets', async () => {
    const connectionId = '22222222-2222-4222-8222-222222222222'
    fixture.sqlite.prepare("INSERT INTO sourceConnections (id,provider,config,credentialRef,createdAt) VALUES (?,'nas',?,'private-credential','2026')")
      .run(connectionId, JSON.stringify({name: 'Archive NAS', host: 'private-host', password: 'private-password'}))
    const response = await fetch(base + '/destinations')
    expect(response.status).toBe(200)
    const destinations = await response.json()
    expect(destinations).toEqual(expect.arrayContaining([
      {id: 'local', provider: 'local', name: '', writable: true},
      {id: connectionId, provider: 'nas', name: 'Archive NAS', writable: true},
    ]))
    expect(JSON.stringify(destinations)).not.toMatch(/private-/)
  })
  it('runs a managed transfer as one request, keeping the source by default', async () => {
    const target = {key: path.join(directory, 'copy.mp4')}
    expect((await post('/jobs', {items: [{kind: 'transfer', mediaId: id, target, removeSource: true}]})).status).toBe(400)
    const response = await post('/jobs', {items: [{kind: 'transfer', mediaId: id, target}]})
    expect(response.status).toBe(202)
    const job = await response.json(); const result = await done(job.id)
    expect(result.items[0]).toMatchObject({kind: 'transfer', phase: 'linked', bytes: 8, total: 8})
    expect(fs.readFileSync(target.key, 'utf8')).toBe('original')
    expect(fs.existsSync(path.join(directory, 'old.mp4'))).toBe(true)
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM verifiedMediaCopies WHERE mediaId = ?').get(id)).toEqual({n: 2})
    expect(createMediaRepository(fixture.drizzle).findById(id)).toMatchObject({name: 'My title', rating: 4, path: path.join(directory, 'old.mp4')})
  })
  it('streams binary originals without JSON buffering, exposes progress and persists recovery history', async () => {
    const response = await post('/jobs', {items: [{kind: 'upload', target: {key: path.join(directory, 'new.mp4')}, uploadSize: 6}]})
    expect(response.status).toBe(202); expect(response.headers.get('cache-control')).toBe('no-store')
    const job: OriginalJob = await response.json()
    expect(job.state).toBe('awaiting_upload')
    const sent = await fetch(`${base}/jobs/${job.id}/uploads/${job.items[0].id}`, {method: 'PUT', headers: {'Content-Type': 'application/octet-stream'}, body: Buffer.from('upload')})
    expect(sent.status).toBe(202)
    const result = await done(job.id)
    expect(result.items[0]).toMatchObject({bytes: 6, total: 6, state: 'completed'})
    expect(fs.readFileSync(path.join(directory, 'new.mp4'), 'utf8')).toBe('upload')
    expect(await (await fetch(base + '/jobs')).json()).toHaveLength(1)
    expect((await fetch(`${base}/jobs/${job.id}/uploads/${job.items[0].id}`, {method: 'PUT', headers: {'Content-Type': 'application/octet-stream'}, body: 'repeat'})).status).toBe(409)
  })
  it('requires explicit deletion confirmation and keeps renaming metadata on the server', async () => {
    expect((await post('/jobs', {items: [{kind: 'delete', mediaId: id}]})).status).toBe(400)
    expect(fs.existsSync(path.join(directory, 'old.mp4'))).toBe(true)
    const response = await post('/jobs', {items: [{kind: 'rename', mediaId: id, target: {key: path.join(directory, 'renamed.mp4')}}]})
    const job = await response.json(); await done(job.id)
    const row = createMediaRepository(fixture.drizzle).findById(id)
    expect(row).toMatchObject({name: 'My title', rating: 4, path: path.join(directory, 'renamed.mp4'), deletedAt: null})
    expect(fs.existsSync(path.join(directory, 'old.mp4'))).toBe(false)
  })
  it('validates request IDs and paths before touching originals', async () => {
    expect((await fetch(base + '/jobs/not-an-id')).status).toBe(400)
    expect((await post('/jobs', {items: [{kind: 'upload', target: {key: 'x'}, uploadSize: -1}]})).status).toBe(400)
    expect((await post('/jobs', {items: [{kind: 'rename', mediaId: id, target: {key: '/tmp/x'}, unexpected: true}]})).status).toBe(400)
    expect(fs.readFileSync(path.join(directory, 'old.mp4'), 'utf8')).toBe('original')
  })
})
