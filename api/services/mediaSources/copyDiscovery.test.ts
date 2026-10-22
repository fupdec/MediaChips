// @vitest-environment node
import fs from 'fs'
import os from 'os'
import path from 'path'
import express from 'express'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {createTestDb, closeTestDb, type TestDb} from '../../db/testUtils/createTestDb'
import {createMediaRepository} from '../../db/repositories/media'
import {createSettingsRepository} from '../../db/repositories/settings'
import type {ApiDb} from '../../types/db'
import {createCopyDiscoveryService} from './copyDiscovery'
import {attachLocalMediaCopy, copyCandidates, openCopySource, type OpenCopySource} from './copies'
import {COPY_SHA256_SETTING} from '../../../shared/copyVerification'
import type {CopyDiscoveryJob} from '../../../shared/copyDiscovery'
import {READ_SOURCE_CAPABILITIES} from '../../../shared/mediaSources'
import registerCopyDiscovery from '../../routes/CopyDiscovery.routes'
import {sourceOperationLocks} from './operationLocks'

describe('background copy discovery', () => {
  let fixture: TestDb, db: ApiDb, directory: string
  const services: ReturnType<typeof createCopyDiscoveryService>[] = []
  const worker = (options: Parameters<typeof createCopyDiscoveryService>[1] = {}) => {
    const service = createCopyDiscoveryService(db, options); services.push(service); return service
  }
  const file = (name: string, bytes: string | Buffer = 'the same media contents') => {
    const filename = path.join(directory, name); fs.writeFileSync(filename, bytes); return filename
  }
  const card = (name: string, bytes?: string | Buffer) => {
    const filename = file(name, bytes)
    return createMediaRepository(db.drizzle).create({path: filename, name: 'Keep this title', rating: 4, filesize: fs.statSync(filename).size, mediaTypeId: 1})
  }
  const scan = async (service: ReturnType<typeof worker>, key: string, mediaId?: number) => {
    const job = service.create({roots: [{key}], ...(mediaId ? {mediaId} : {})})
    await service.tick(); return service.job(job.id)
  }
  beforeEach(() => {
    fixture = createTestDb('copy-discovery'); db = {...fixture}
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-discovery-'))
    fixture.sqlite.exec("INSERT INTO mediaTypes (id,type,name,createdAt,updatedAt) VALUES (1,'video','Videos','2026','2026')")
  })
  afterEach(() => {
    services.splice(0).forEach(service => service.dispose())
    closeTestDb(fixture); fs.rmSync(directory, {recursive: true, force: true})
  })

  it('finds one renamed file by size without a stored fingerprint and links it without changing metadata', async () => {
    const original = card('original.mp4'), copy = file('renamed.mp4')
    const before = createMediaRepository(db.drizzle).findById(original.id)
    const job = await scan(worker(), copy)
    expect(job).toMatchObject({state: 'completed', method: 'oshash', counts: {attached: 1}})
    expect(copyCandidates(db, original.id).map(row => row.path).sort()).toEqual([original.path, copy].sort())
    expect(copyCandidates(db, original.id).every(row => row.verificationMethod === 'oshash')).toBe(true)
    expect(createMediaRepository(db.drizzle).findById(original.id)).toEqual(before)
    expect(fs.readFileSync(copy).equals(fs.readFileSync(original.path))).toBe(true)
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM media').get()).toEqual({n: 1})
  })

  it('uses an online retained copy when the primary file and another retained copy are offline', async () => {
    const original = card('original.mp4'), available = file('available.mp4'), offline = file('offline.mp4')
    await attachLocalMediaCopy(db, original.id, available, new AbortController().signal)
    await attachLocalMediaCopy(db, original.id, offline, new AbortController().signal)
    fs.unlinkSync(original.path); fs.unlinkSync(offline)
    const copy = file('third-name.mp4')
    expect((await scan(worker(), copy)).counts.attached).toBe(1)
    expect(copyCandidates(db, original.id)).toHaveLength(4)
  })

  it('rejects same-size different contents and does not merge existing cards', async () => {
    const original = card('original.mp4', 'aaaaaaaaaaaaaaaaaaaaaa'), other = file('original-copy.mp4', 'bbbbbbbbbbbbbbbbbbbbbb')
    const service = worker()
    expect((await scan(service, other)).counts.unmatched).toBe(1)
    const existing = card('existing.mp4', 'aaaaaaaaaaaaaaaaaaaaaa')
    const job = await scan(service, existing.path)
    expect(job.counts.existing).toBe(1)
    expect(copyCandidates(db, original.id)).toHaveLength(1)
    expect(createMediaRepository(db.drizzle).findById(existing.id)).toBeDefined()
  })

  it('keeps multiple matching cards ambiguous and rechecks a user-selected card', async () => {
    const a = card('a.mp4'), b = card('b.mp4'), copy = file('copy.mp4')
    const service = worker(), job = await scan(service, copy)
    expect(job.counts.ambiguous).toBe(1)
    expect(job.items[0].candidateIds.sort()).toEqual([a.id, b.id].sort())
    expect(copyCandidates(db, a.id)).toHaveLength(1)
    service.choose(job.id, job.items[0].id, b.id)
    await service.tick()
    expect(service.job(job.id).items[0]).toMatchObject({state: 'attached', mediaId: b.id})
    expect(copyCandidates(db, a.id)).toHaveLength(1)
    expect(copyCandidates(db, b.id)).toHaveLength(2)
  })

  it('does not assume uniqueness when another possible card cannot be read', async () => {
    card('a.mp4'); const offline = card('offline.mp4'); fs.unlinkSync(offline.path)
    const copy = file('copy.mp4'), job = await scan(worker(), copy)
    expect(job.counts.ambiguous).toBe(1)
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM verifiedMediaCopies').get()).toEqual({n: 0})
  })

  it('snapshots strict mode and rejects matching ends with a changed middle', async () => {
    const bytes = Buffer.alloc(320000, 7), original = card('original.mp4', bytes)
    bytes.fill(99, 65536, bytes.length - 65536)
    const copy = file('copy.mp4', bytes)
    createSettingsRepository(db.drizzle).upsertByOption(COPY_SHA256_SETTING, '1')
    const service = worker(), job = service.create({roots: [{key: copy}]})
    createSettingsRepository(db.drizzle).upsertByOption(COPY_SHA256_SETTING, '0')
    await service.tick()
    expect(service.job(job.id)).toMatchObject({method: 'sha256', counts: {unmatched: 1}})
    expect(copyCandidates(db, original.id)).toHaveLength(1)
    expect((await scan(service, copy)).counts.attached).toBe(1)
    expect(copyCandidates(db, original.id).every(row => row.verificationMethod === 'oshash')).toBe(true)
  })

  it('does not downgrade existing full SHA-256 evidence during sampled attachment', async () => {
    const original = card('original.mp4'), previous = file('previous.mp4')
    createSettingsRepository(db.drizzle).upsertByOption(COPY_SHA256_SETTING, '1')
    await attachLocalMediaCopy(db, original.id, previous, new AbortController().signal)
    const before = copyCandidates(db, original.id).find(row => row.path === original.path)!.stored!
    createSettingsRepository(db.drizzle).upsertByOption(COPY_SHA256_SETTING, '0')
    const next = file('next.mp4')
    expect((await scan(worker(), next)).counts.attached).toBe(1)
    expect(copyCandidates(db, original.id).find(row => row.path === original.path)?.stored).toMatchObject({sha256: before.sha256, verificationMethod: 'sha256', verifiedAt: before.verifiedAt})
  })

  it('rejects a replaced sampled reference when upgrading to SHA-256', async () => {
    const original = card('original.mp4'), previous = file('previous.mp4')
    await attachLocalMediaCopy(db, original.id, previous, new AbortController().signal)
    fs.unlinkSync(previous)
    fs.writeFileSync(original.path, 'replaced media content!')
    const copy = file('new-copy.mp4', 'replaced media content!')
    createSettingsRepository(db.drizzle).upsertByOption(COPY_SHA256_SETTING, '1')
    expect((await scan(worker(), copy)).counts.attached || 0).toBe(0)
    expect(copyCandidates(db, original.id)).toHaveLength(2)
  })

  it('honors an offline full-hash baseline when a sampled reference disagrees', async () => {
    const original = card('original.mp4', Buffer.alloc(320000, 7)), strictCopy = file('strict.mp4', Buffer.alloc(320000, 7))
    createSettingsRepository(db.drizzle).upsertByOption(COPY_SHA256_SETTING, '1')
    await attachLocalMediaCopy(db, original.id, strictCopy, new AbortController().signal)
    const changed = Buffer.alloc(320000, 7); changed.fill(99, 65536, changed.length - 65536)
    const sampledCopy = file('sampled.mp4', changed)
    createSettingsRepository(db.drizzle).upsertByOption(COPY_SHA256_SETTING, '0')
    await attachLocalMediaCopy(db, original.id, sampledCopy, new AbortController().signal)
    fs.unlinkSync(original.path); fs.unlinkSync(strictCopy)
    const copy = file('new-copy.mp4', changed)
    createSettingsRepository(db.drizzle).upsertByOption(COPY_SHA256_SETTING, '1')
    expect((await scan(worker(), copy)).counts.attached || 0).toBe(0)
    expect(copyCandidates(db, original.id)).toHaveLength(3)
  })

  it('undoes an automatic link without deleting bytes, and remembers the rejected match', async () => {
    const original = card('original.mp4'), copy = file('copy.mp4'), service = worker()
    const job = await scan(service, copy)
    expect(service.undo(job.id, job.items[0].id).counts.dismissed).toBe(1)
    expect(copyCandidates(db, original.id)).toHaveLength(1)
    expect(fs.existsSync(copy)).toBe(true)
    expect((await scan(service, copy)).counts.attached || 0).toBe(0)
    fs.writeFileSync(copy, 'the same media contents') // New observed version may be proposed again.
    expect((await scan(service, copy)).counts.attached).toBe(1)
  })

  it('resumes saved queued/checking work without repeating an attachment', async () => {
    const original = card('original.mp4'), first = file('first.mp4'), second = file('second.mp4')
    const service = worker(), done = await scan(service, first)
    const queued = service.create({roots: [{key: second}]})
    service.dispose()
    const resumed = worker(); await resumed.tick()
    expect(resumed.job(queued.id).counts.attached).toBe(1)
    const copyId = resumed.job(queued.id).items[0].copyId
    fixture.sqlite.prepare("UPDATE copyDiscoveryJobs SET state = 'verifying' WHERE id = ?").run(queued.id)
    await resumed.tick()
    expect(resumed.job(queued.id).items[0].copyId).toBe(copyId)
    expect(resumed.job(done.id).counts.attached).toBe(1)
    expect(copyCandidates(db, original.id)).toHaveLength(3)
    const pending = resumed.create({roots: [{key: file('third.mp4')}]})
    fixture.sqlite.prepare("INSERT INTO copyDiscoveryItems (id,jobId,path,name,size,version,state) VALUES ('checkpoint',?,?,'third.mp4',22,'old','checking')").run(pending.id, path.join(directory, 'third.mp4'))
    await resumed.tick()
    expect(resumed.job(pending.id).counts.attached).toBe(1)
  })

  it('cancels an active read and can continue from the saved candidate', async () => {
    card('original.mp4'); const copy = file('copy.mp4')
    let reading!: () => void
    const started = new Promise<void>(resolve => { reading = resolve })
    let block = true
    const open: OpenCopySource = async (...args) => {
      const opened = await openCopySource(...args)
      if (args[1] === copy && block) opened.adapter.read = async (_key, _range, signal) => {
        reading(); await new Promise((_, reject) => signal!.addEventListener('abort', () => reject(signal!.reason), {once: true}))
        throw new Error('unreachable')
      }
      return opened
    }
    const service = worker({open}), job = service.create({roots: [{key: copy}]})
    const running = service.tick(); await started; service.cancel(job.id); await running
    expect(service.job(job.id).state).toBe('cancelled')
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM verifiedMediaCopies').get()).toEqual({n: 0})
    block = false; service.retry(job.id); await service.tick()
    expect(service.job(job.id).counts.attached).toBe(1)
  })

  it('rejects a file changed after hashing and refreshes it when retrying', async () => {
    const original = card('original.mp4'), copy = file('copy.mp4')
    let change = true
    const open: OpenCopySource = async (...args) => {
      const opened = await openCopySource(...args), read = opened.adapter.read.bind(opened.adapter)
      if (args[1] === original.path) opened.adapter.read = async (...readArgs) => {
        if (change) { change = false; fs.writeFileSync(copy, 'different media bytes!') }
        return read(...readArgs)
      }
      return opened
    }
    const service = worker({open}), job = await scan(service, copy)
    expect(job).toMatchObject({counts: {failed: 1}, items: [{error: 'source_version_changed'}]})
    expect(copyCandidates(db, original.id)).toHaveLength(1)
    fs.writeFileSync(copy, 'the same media contents')
    service.retry(job.id); await service.tick()
    expect(service.job(job.id).counts.attached).toBe(1)
  })

  it('rejects a concurrent change to the candidate catalog', async () => {
    const original = card('original.mp4'), copy = file('copy.mp4')
    let change = true
    const open: OpenCopySource = async (...args) => {
      const opened = await openCopySource(...args), read = opened.adapter.read.bind(opened.adapter)
      if (args[1] === original.path) opened.adapter.read = async (...readArgs) => {
        if (change) { change = false; card('concurrent.mp4') }
        return read(...readArgs)
      }
      return opened
    }
    const job = await scan(worker({open}), copy)
    expect(job.items[0]).toMatchObject({state: 'failed', error: 'media_changed'})
    expect(copyCandidates(db, original.id)).toHaveLength(1)
  })

  it('keeps concurrent title/rating edits while attaching a copy', async () => {
    const original = card('original.mp4'), copy = file('copy.mp4')
    let edited = false
    const open: OpenCopySource = async (...args) => {
      const opened = await openCopySource(...args), read = opened.adapter.read.bind(opened.adapter)
      if (args[1] === original.path) opened.adapter.read = async (...readArgs) => {
        if (!edited) { edited = true; createMediaRepository(db.drizzle).updateById(original.id, {name: 'Edited during import', rating: 5}) }
        return read(...readArgs)
      }
      return opened
    }
    expect((await scan(worker({open}), copy)).counts.attached).toBe(1)
    expect(createMediaRepository(db.drizzle).findById(original.id)).toMatchObject({name: 'Edited during import', rating: 5})
  })

  it('compares large remote copies with bounded ranges and no complete download', async () => {
    const size = 50 * 1024 ** 3, connectionId = '11111111-1111-4111-8111-111111111111'
    fixture.sqlite.prepare("INSERT INTO sourceConnections (id,config,credentialRef,createdAt) VALUES (?,'{}','secret','2026')").run(connectionId)
    const original = createMediaRepository(db.drizzle).create({path: 'gdrive://original', filesize: size, mediaTypeId: 1})
    const reads: string[] = []
    const object = (key: string) => ({resourceKey: key, name: 'renamed.mp4', size, version: 'v1', isDirectory: false, contentType: 'video/mp4'})
    const adapter = (key: string) => ({provider: 'nas' as const, capabilities: READ_SOURCE_CAPABILITIES,
      close() {}, list: async () => ({entries: []}), stat: async () => object(key),
      read: async (_key: string, range?: string) => {
        if (!range) throw new Error('Full download forbidden')
        reads.push(range)
        const [, start, end] = /^bytes=(\d+)-(\d+)$/.exec(range)!
        return {status: 206, headers: {'content-range': `bytes ${start}-${end}/${size}`}, body: Buffer.alloc(Number(end) - Number(start) + 1)}
      },
    })
    const service = worker({openRoot: async () => adapter('folder/renamed.mp4'), open: async (_db, key) => ({key, adapter: adapter(key)})})
    const job = service.create({roots: [{connectionId, key: 'folder/renamed.mp4'}]})
    await service.tick()
    expect(service.job(job.id).counts.attached).toBe(1)
    expect(reads).toHaveLength(4)
    expect(copyCandidates(db, original.id)).toHaveLength(2)
  })

  it('waits for managed source operations instead of reading during a move', async () => {
    card('original.mp4'); const copy = file('copy.mp4'), service = worker()
    const job = service.create({roots: [{key: copy}]})
    const lock = `${fixture.sqlite.name}:local`; sourceOperationLocks.add(lock)
    try { await service.tick(); expect(service.job(job.id).state).toBe('queued') }
    finally { sourceOperationLocks.delete(lock) }
    await service.tick(); expect(service.job(job.id).counts.attached).toBe(1)
  })

  it('does not block an unrelated connection while comparing local copies', async () => {
    card('original.mp4'); const copy = file('copy.mp4'), service = worker()
    const connectionId = '11111111-1111-4111-8111-111111111111'
    fixture.sqlite.prepare("INSERT INTO sourceConnections (id,config,credentialRef,createdAt) VALUES (?,'{}','secret','2026')").run(connectionId)
    const lock = `${fixture.sqlite.name}:${connectionId}`; sourceOperationLocks.add(lock)
    try { expect((await scan(service, copy)).counts.attached).toBe(1) }
    finally { sourceOperationLocks.delete(lock) }
  })

  it('does not attach from an incomplete inventory, and retries without duplicate rows', async () => {
    card('original.mp4'); const copy = file('copy.mp4')
    let fail = true
    const info = {resourceKey: copy, name: 'copy.mp4', size: fs.statSync(copy).size, version: 'pending', isDirectory: false, contentType: 'video/mp4'}
    const opened = await openCopySource(db, copy, new AbortController().signal)
    Object.assign(info, await opened.adapter.stat(opened.key)); opened.adapter.close()
    const service = worker({openRoot: async () => ({provider: 'local', capabilities: READ_SOURCE_CAPABILITIES,
      close() {}, stat: async () => ({...info, isDirectory: true}), read: async () => { throw new Error('unused') },
      list: async (_key, token) => {
        if (fail && token) throw new Error('listing interrupted')
        return {entries: [info], ...(fail ? {nextPageToken: 'next'} : {})}
      },
    })})
    const job = await scan(service, directory)
    expect(job.state).toBe('failed')
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM verifiedMediaCopies').get()).toEqual({n: 0})
    fail = false; service.retry(job.id); await service.tick()
    expect(service.job(job.id)).toMatchObject({state: 'completed', total: 1, counts: {attached: 1}})
  })

  it('recovers an interrupted active worker and keeps its saved job', async () => {
    card('original.mp4'); const copy = file('copy.mp4')
    let reading!: () => void
    const started = new Promise<void>(resolve => { reading = resolve })
    const open: OpenCopySource = async (...args) => {
      const opened = await openCopySource(...args)
      if (args[1] === copy) opened.adapter.read = async (_key, _range, signal) => {
        reading()
        await new Promise((_, reject) => signal!.addEventListener('abort', () => reject(signal!.reason), {once: true}))
        throw new Error('unreachable')
      }
      return opened
    }
    const first = worker({open}), job = first.create({roots: [{key: copy}]})
    const running = first.tick(); await started; first.dispose(); await running
    expect(first.job(job.id).state).toBe('verifying')
    const restarted = worker(); await restarted.tick()
    expect(restarted.job(job.id)).toMatchObject({state: 'completed', counts: {attached: 1}})
  })

  it('does not write an old task into a switched library', async () => {
    card('original.mp4'); const copy = file('copy.mp4')
    db.path = 'first-library'
    const open: OpenCopySource = async (...args) => {
      const opened = await openCopySource(...args), read = opened.adapter.read.bind(opened.adapter)
      opened.adapter.read = async (...readArgs) => { db.path = 'second-library'; return read(...readArgs) }
      return opened
    }
    const service = worker({open}), job = await scan(service, copy)
    expect(job.counts.attached || 0).toBe(0)
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM verifiedMediaCopies').get()).toEqual({n: 0})
  })

  it('scans folders recursively, skips symlinks and handles tiny files', async () => {
    const original = card('original.jpg', 'tiny')
    const nested = path.join(directory, 'scan', 'nested'); fs.mkdirSync(nested, {recursive: true})
    const copy = path.join(nested, 'renamed.jpg'); fs.writeFileSync(copy, 'tiny')
    fs.symlinkSync(directory, path.join(nested, 'cycle'))
    const job = await scan(worker(), path.join(directory, 'scan'))
    expect(job).toMatchObject({state: 'completed', total: 1, counts: {attached: 1}})
    expect(copyCandidates(db, original.id).every(row => row.verificationMethod === 'sha256')).toBe(true)
  })

  it('exposes background jobs through HTTP and rejects invalid requests', async () => {
    card('original.mp4'); const copy = file('copy.mp4'), service = worker(), app = express()
    app.use(express.json()); registerCopyDiscovery(app, db, service)
    const server = app.listen(0, '127.0.0.1')
    await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
    const base = `http://127.0.0.1:${(server.address() as {port: number}).port}/api/copy-discovery/jobs`
    try {
      expect((await fetch(base, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({roots: []})})).status).toBe(400)
      expect((await fetch(base + '/bad')).status).toBe(400)
      const response = await fetch(base, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({roots: [{key: copy}]})})
      expect(response.status).toBe(202)
      expect(response.headers.get('cache-control')).toBe('no-store')
      const job: CopyDiscoveryJob = await response.json()
      await service.tick()
      const result: CopyDiscoveryJob = await (await fetch(base + '/' + job.id)).json()
      expect(result.counts.attached).toBe(1)
      const undo = await fetch(`${base}/${job.id}/items/${result.items[0].id}/undo`, {method: 'POST'})
      expect(undo.status).toBe(200)
      expect((await undo.json()).counts.dismissed).toBe(1)
    } finally { app.emit('copy-discovery:dispose'); await new Promise<void>(resolve => server.close(() => resolve())) }
  })
})
