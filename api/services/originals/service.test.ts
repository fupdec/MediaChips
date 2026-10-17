// @vitest-environment node
import fs from 'fs'
import os from 'os'
import path from 'path'
import {Readable} from 'stream'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createTestDb, closeTestDb, type TestDb} from '../../db/testUtils/createTestDb'
import {createMediaRepository} from '../../db/repositories/media'
import type {ApiDb} from '../../types/db'
import {createOriginalOperationsService} from './service'
import {softDeleteMedia} from '../mediaTrash'
import type {OriginalJob, OriginalOperation} from '../../../shared/originalOperations'
import {sourceOperationLocks} from '../mediaSources/operationLocks'
import type {SourceObject, SourceWriteAdapter} from '../mediaSources/adapter'
import {nasMediaPath} from '../../../shared/remoteMedia'
import {NAS_SOURCE_CAPABILITIES} from '../../../shared/mediaSources'

vi.mock('../mediaCacheInvalidation', () => ({invalidateMediaDerivedCaches: vi.fn()}))
let fixture: TestDb, db: ApiDb, directory: string, service: ReturnType<typeof createOriginalOperationsService>
let id: number, original: string
beforeEach(() => {
  fixture = createTestDb('original-operations'); db = {...fixture, path: fixture.dbPath}
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-originals-'))
  original = path.join(directory, 'old.mp4'); fs.writeFileSync(original, 'original bytes')
  const card = createMediaRepository(db.drizzle).create({path: original, basename: 'old.mp4', name: 'My title', rating: 5, favorite: true, views: 8, bookmark: 'keep', contentHash: 'unchanged', mediaCreatedAt: '2020'})
  id = card.id
  createMediaRepository(db.drizzle).updateById(id, {rating: 5, favorite: true, views: 8, bookmark: 'keep', mediaCreatedAt: '2020'})
  fixture.sqlite.exec(`INSERT INTO marks (mediaId, time, text) VALUES (${id}, 12, 'Chapter');
    INSERT INTO mediaInPlaylists (mediaId,playlistId,"order") VALUES (${id}, 9, 3);
    INSERT INTO tagsInMedia (mediaId,metaId,tagId) VALUES (${id},1,2);
    INSERT INTO valuesInMedia (mediaId,metaId,value) VALUES (${id},3,'Notes');`)
  service = createOriginalOperationsService(db, {directory: path.join(directory, 'spool')})
})
afterEach(() => { service.dispose(); sourceOperationLocks.clear(); closeTestDb(fixture); fs.rmSync(directory, {recursive: true, force: true}) })
const target = (name: string) => ({key: path.join(directory, name)})
const card = () => createMediaRepository(db.drizzle).findById(id)!
async function finish(job: OriginalJob) {
  await vi.waitFor(async () => { await service.tick(); expect(['completed', 'failed'].includes(service.job(job.id).state)).toBe(true) })
  return service.job(job.id)
}
const run = (items: OriginalOperation[]) => finish(service.create({items}))
function metadata() {
  const {path: _path, basename: _basename, ext: _ext, ...rest} = card()
  return {card: rest, relations: ['marks', 'mediaInPlaylists', 'tagsInMedia', 'valuesInMedia'].map(table => fixture.sqlite.prepare(`SELECT * FROM ${table}`).all())}
}

describe('durable original operations', () => {
  it('downloads then renames then creates a folder, moves and deletes bytes, preserving the complete card', async () => {
    const before = metadata()
    const job = await run([
      {kind: 'download', mediaId: id, target: target('download.mp4'), conflict: 'fail'},
      {kind: 'rename', mediaId: id, target: target('renamed.mp4'), conflict: 'fail'},
      {kind: 'mkdir', target: target('folder'), conflict: 'fail'},
      {kind: 'move', mediaId: id, target: target('folder/moved.mp4'), conflict: 'fail'},
      {kind: 'delete', mediaId: id, confirmDelete: true, conflict: 'fail'},
    ])
    expect(job.state, JSON.stringify(job.items)).toBe('completed')
    expect(job.items.every(item => item.bytes === item.total)).toBe(true)
    expect(fs.readFileSync(target('download.mp4').key, 'utf8')).toBe('original bytes')
    expect(fs.existsSync(original)).toBe(false)
    expect(fs.existsSync(target('renamed.mp4').key)).toBe(false)
    expect(fs.existsSync(target('folder/moved.mp4').key)).toBe(false)
    expect(card()).toMatchObject({path: target('folder/moved.mp4').key, basename: 'moved.mp4', deletedAt: null, trashPurgeFile: false})
    expect(metadata()).toEqual(before)
  })
  it('renames within a volume without making a second full-sized copy', async () => {
    const inode = fs.statSync(original).ino
    expect((await run([{kind: 'rename', mediaId: id, target: target('renamed.mp4'), conflict: 'fail'}])).state).toBe('completed')
    expect(fs.statSync(target('renamed.mp4').key).ino).toBe(inode)
  })
  it('keeps removing from the library separate from deleting an original', () => {
    expect(softDeleteMedia(db, id)).toBe(true)
    expect(fs.readFileSync(original, 'utf8')).toBe('original bytes')
    expect(card().deletedAt).toBeTruthy()
    expect(() => service.create({items: [{kind: 'delete', mediaId: id, conflict: 'fail'}]})).toThrow()
  })
  it('pauses the remaining batch before deletion if a download fails', async () => {
    fs.writeFileSync(target('taken.mp4').key, 'keep existing')
    const job = await run([
      {kind: 'download', mediaId: id, target: target('taken.mp4'), conflict: 'fail'},
      {kind: 'delete', mediaId: id, confirmDelete: true, conflict: 'fail'},
    ])
    expect(job.state).toBe('failed'); expect(job.items[1].state).toBe('pending')
    expect(fs.readFileSync(original, 'utf8')).toBe('original bytes')
  })
  it('preserves inherited folder chips when moving the existing card', async () => {
    const folderId = fixture.sqlite.prepare("INSERT INTO folderPaths (path, createdAt, updatedAt) VALUES (?, '2026', '2026')").run(directory).lastInsertRowid
    fixture.sqlite.prepare('INSERT INTO tagsInFolders (folderId,tagId,metaId) VALUES (?,10,20)').run(folderId)
    fs.mkdirSync(target('new-folder').key)
    const job = await run([{kind: 'move', mediaId: id, target: target('new-folder/renamed.mp4'), conflict: 'fail'}])
    expect(job.state, JSON.stringify(job)).toBe('completed')
    expect(fixture.sqlite.prepare('SELECT * FROM tagsInMedia WHERE tagId = 10').get()).toEqual({mediaId: id, tagId: 10, metaId: 20})
  })
  it('recovers a copied move after unlink when the filesystem does not support the initial hard link', async () => {
    const link = vi.spyOn(fs.promises, 'link').mockRejectedValueOnce(Object.assign(new Error('Cross device'), {code: 'EXDEV'}))
    let stopped = false
    service.dispose(); service = createOriginalOperationsService(db, {checkpoint(item) { if (!stopped && item.phase === 'removed') { stopped = true; throw new Error('Exit after unlink') } }})
    const job = await run([{kind: 'move', mediaId: id, target: target('copied.mp4'), conflict: 'fail'}])
    link.mockRestore()
    expect(job.items[0]).toMatchObject({phase: 'removed', localLink: false})
    expect(fs.existsSync(original)).toBe(false)
    service.dispose(); service = createOriginalOperationsService(db)
    expect((await finish(service.retry(job.id))).state).toBe('completed')
    expect(fs.readFileSync(target('copied.mp4').key, 'utf8')).toBe('original bytes')
  })
  it('handles conflicts without overwriting, and retries only unfinished items', async () => {
    fs.writeFileSync(target('taken.mp4').key, 'other bytes')
    const job = await run([
      {kind: 'download', mediaId: id, target: target('complete.mp4'), conflict: 'fail'},
      {kind: 'rename', mediaId: id, target: target('taken.mp4'), conflict: 'fail'},
    ])
    expect(job.state).toBe('failed'); expect(job.items[1].error).toBe('conflict')
    const inode = fs.statSync(target('complete.mp4').key).ino
    const retried = await finish(service.retry(job.id, 'keep-both'))
    expect(retried.state, JSON.stringify(retried)).toBe('completed')
    expect(card().path).toBe(target('taken (1).mp4').key)
    expect(fs.readFileSync(target('taken.mp4').key, 'utf8')).toBe('other bytes')
    expect(fs.statSync(target('complete.mp4').key).ino).toBe(inode)
    const skipped = await run([{kind: 'mkdir', target: target('taken.mp4'), conflict: 'skip'}])
    expect(skipped.items[0].state).toBe('skipped')
  })
  it('streams uploads into staging, creates the parent first and publishes a complete file', async () => {
    const job = service.create({items: [
      {kind: 'mkdir', target: target('uploads'), conflict: 'fail'},
      {kind: 'upload', target: target('uploads/new.mp4'), uploadSize: 6, conflict: 'fail'},
    ]})
    expect(job.state).toBe('awaiting_upload')
    await service.upload(job.id, job.items[1].id, Readable.from(['upl', 'oad']))
    const result = await finish(job)
    expect(result.state, JSON.stringify(result)).toBe('completed')
    expect(fs.readFileSync(target('uploads/new.mp4').key, 'utf8')).toBe('upload')
    expect(fs.readdirSync(target('uploads').key)).toEqual(['new.mp4'])
    expect(fs.readdirSync(path.join(directory, 'spool'))).toEqual([])
  })
  it('does not publish truncated uploads and accepts selecting the file again', async () => {
    const job = service.create({items: [{kind: 'upload', target: target('new.mp4'), uploadSize: 6, conflict: 'fail'}]})
    await expect(service.upload(job.id, job.items[0].id, Readable.from(['bad']))).rejects.toMatchObject({code: 'size_mismatch'})
    expect(fs.existsSync(target('new.mp4').key)).toBe(false)
    expect(service.job(job.id).state).toBe('awaiting_upload')
    await service.upload(job.id, job.items[0].id, Readable.from(['upload']))
    expect((await finish(job)).state).toBe('completed')
  })
  it('recovers a fully committed upload spool after losing its acknowledgment', async () => {
    const job = service.create({items: [{kind: 'upload', target: target('new.mp4'), uploadSize: 6, conflict: 'fail'}]})
    const spoolDirectory = path.join(directory, 'spool')
    fs.mkdirSync(spoolDirectory)
    fs.writeFileSync(path.join(spoolDirectory, job.items[0].id + '.upload'), 'upload')
    service.dispose(); service = createOriginalOperationsService(db, {directory: spoolDirectory})
    expect(service.job(job.id).state).toBe('queued')
    expect((await finish(job)).state).toBe('completed')
    expect(fs.readFileSync(target('new.mp4').key, 'utf8')).toBe('upload')
  })
  it('recovers after publication and after the card link, without losing the old source', async () => {
    for (const phase of ['published', 'linked'] as const) {
      let failed = false
      service.dispose()
      service = createOriginalOperationsService(db, {checkpoint(item) { if (!failed && item.phase === phase) { failed = true; throw new Error('Simulated process interruption') } }})
      const next = target(phase + '.mp4')
      const job = await run([{kind: 'move', mediaId: id, target: next, conflict: 'fail'}])
      expect(job.state).toBe('failed'); expect(job.items[0].phase).toBe(phase)
      const oldSource = job.items[0].source!.key
      expect(fs.existsSync(oldSource)).toBe(true)
      const persisted = {...service.job(job.id), state: 'running'}
      fixture.sqlite.prepare('UPDATE originalOperationJobs SET payload = ? WHERE id = ?').run(JSON.stringify(persisted), job.id)
      service.dispose(); service = createOriginalOperationsService(db)
      expect(service.job(job.id).state).toBe('interrupted')
      expect((await finish(service.retry(job.id))).state).toBe('completed')
      expect(card().path).toBe(next.key); expect(fs.existsSync(oldSource)).toBe(false)
    }
  })
  it('keeps the source when a published target is changed before recovery', async () => {
    service.dispose()
    service = createOriginalOperationsService(db, {checkpoint(item) { if (item.phase === 'linked') throw new Error('Stop after card link') }})
    const job = await run([{kind: 'move', mediaId: id, target: target('moved.mp4'), conflict: 'fail'}])
    expect(job.state).toBe('failed')
    fs.unlinkSync(target('moved.mp4').key)
    fs.writeFileSync(target('moved.mp4').key, 'different file')
    service.dispose(); service = createOriginalOperationsService(db)
    const recovered = await finish(service.retry(job.id))
    expect(recovered.items[0].error).toBe('source_changed')
    expect(fs.readFileSync(original, 'utf8')).toBe('original bytes')
  })
  it('rechecks the published target immediately before unlinking the source', async () => {
    let replaced = false
    service.dispose()
    service = createOriginalOperationsService(db, {checkpoint(item) {
      if (!replaced && item.phase === 'linked') {
        replaced = true; fs.unlinkSync(item.target!.key); fs.writeFileSync(item.target!.key, 'different file')
      }
    }})
    const job = await run([{kind: 'move', mediaId: id, target: target('moved.mp4'), conflict: 'fail'}])
    expect(job.items[0].error).toBe('source_changed')
    expect(fs.readFileSync(original, 'utf8')).toBe('original bytes')
  })
  it('does not follow a card relinked while waiting in the queue', async () => {
    sourceOperationLocks.add(`${fixture.sqlite.name}:local`)
    const job = service.create({items: [{kind: 'delete', mediaId: id, confirmDelete: true, conflict: 'fail'}]})
    await service.tick()
    fs.writeFileSync(target('another.mp4').key, 'keep another')
    createMediaRepository(db.drizzle).updateById(id, {path: target('another.mp4').key})
    sourceOperationLocks.clear()
    const result = await finish(job)
    expect(result.items[0].error).toBe('card_changed')
    expect(fs.existsSync(original)).toBe(true); expect(fs.readFileSync(target('another.mp4').key, 'utf8')).toBe('keep another')
  })
})

describe('NAS recovery', () => {
  const connectionId = '11111111-1111-4111-8111-111111111111'
  let objects: Map<string, Buffer>, adapter: SourceWriteAdapter, loseResponse: boolean
  beforeEach(() => {
    service.dispose(); loseResponse = false
    objects = new Map([['old.mp4', Buffer.from('original bytes')]])
    const info = (key: string): SourceObject => {
      if (!objects.has(key)) throw Object.assign(new Error('not found'), {status: 404})
      return {resourceKey: key, name: path.posix.basename(key), size: objects.get(key)!.length, version: 'v1', isDirectory: false, contentType: 'video/mp4'}
    }
    adapter = {provider: 'nas', capabilities: NAS_SOURCE_CAPABILITIES, stat: vi.fn(async key => info(key)), list: vi.fn(async () => ({entries: []})),
      read: vi.fn(async key => ({status: 200, headers: {}, body: Readable.from([objects.get(key)!])})), close: vi.fn(),
      move: vi.fn(async (from, to) => { if (objects.has(to)) throw Object.assign(new Error('conflict'), {code: 'conflict'}); objects.set(to, objects.get(from)!); objects.delete(from); if (loseResponse) { loseResponse = false; throw new Error('Lost reply') } }),
      remove: vi.fn(async key => { objects.delete(key) }),
    }
    fixture.sqlite.prepare("INSERT INTO sourceConnections (id,provider,config,credentialRef,createdAt) VALUES (?,'nas','{}','secret','2026')").run(connectionId)
    createMediaRepository(db.drizzle).updateById(id, {path: nasMediaPath(connectionId, 'old.mp4')})
    fixture.sqlite.prepare("INSERT INTO mediaLocations (id,mediaId,connectionId,resourceKey,version) VALUES ('location',?,?,'old.mp4','v1')").run(id, connectionId)
    service = createOriginalOperationsService(db, {open: async () => adapter})
  })
  it('verifies an ambiguous rename reply and links the same card on retry', async () => {
    const before = metadata(); loseResponse = true
    const job = await run([{kind: 'rename', mediaId: id, target: {connectionId, key: 'renamed.mp4'}, conflict: 'fail'}])
    expect(job.state).toBe('failed'); expect(job.items[0].phase).toBe('mutating')
    expect(objects.has('old.mp4')).toBe(false); expect(objects.has('renamed.mp4')).toBe(true)
    expect((await finish(service.retry(job.id))).state).toBe('completed')
    expect(adapter.move).toHaveBeenCalledTimes(1)
    expect(card().path).toBe(nasMediaPath(connectionId, 'renamed.mp4')); expect(metadata()).toEqual(before)
    expect(fixture.sqlite.prepare('SELECT resourceKey FROM mediaLocations').get()).toEqual({resourceKey: 'renamed.mp4'})
  })
  it('deletes NAS bytes and marks the original unavailable while preserving the card', async () => {
    const result = await run([{kind: 'delete', mediaId: id, confirmDelete: true, conflict: 'fail'}])
    expect(result.state).toBe('completed'); expect(objects.size).toBe(0); expect(card().deletedAt).toBeNull()
    expect(fixture.sqlite.prepare('SELECT availability FROM mediaLocations').get()).toEqual({availability: 'unavailable'})
  })
  it('restarts a partially failed NAS upload from its saved spool and removes only its own staging file', async () => {
    let fail = true
    adapter.write = vi.fn(async (key, input, _size, progress) => {
      const chunks: Buffer[] = []
      for await (const chunk of input) {
        if (fail) { fail = false; objects.set(key, Buffer.from(chunk).subarray(0, 2)); progress(2); throw new Error('Connection lost') }
        chunks.push(Buffer.from(chunk))
      }
      const bytes = Buffer.concat(chunks); objects.set(key, bytes); progress(bytes.length)
    })
    const job = service.create({items: [{kind: 'upload', target: {connectionId, key: 'uploaded.mp4'}, uploadSize: 6, conflict: 'fail'}]})
    await service.upload(job.id, job.items[0].id, Readable.from(['upload']))
    const first = await finish(job)
    expect(first.state).toBe('failed'); expect(first.items[0].bytes).toBe(2)
    expect(objects.has('uploaded.mp4')).toBe(false)
    expect((await finish(service.retry(job.id))).state).toBe('completed')
    expect(objects.get('uploaded.mp4')?.toString()).toBe('upload')
    expect(objects.get('old.mp4')?.toString()).toBe('original bytes')
    expect([...objects.keys()].some(key => key.endsWith('.part'))).toBe(false)
  })
  it('does not mutate a connection whose root/configuration changed after submission', async () => {
    sourceOperationLocks.add(`${fixture.sqlite.name}:${connectionId}`)
    const job = service.create({items: [{kind: 'delete', mediaId: id, confirmDelete: true, conflict: 'fail'}]})
    fixture.sqlite.prepare('UPDATE sourceConnections SET config = ? WHERE id = ?').run('{"root":"changed"}', connectionId)
    sourceOperationLocks.clear()
    const result = await finish(job)
    expect(result.items[0].error).toBe('source_changed')
    expect(adapter.remove).not.toHaveBeenCalled(); expect(objects.has('old.mp4')).toBe(true)
  })
})

describe('Google Drive originals', () => {
  let transport: import('../cloudDrive/types').DriveTransport
  beforeEach(async () => {
    service.dispose()
    const {createMockDriveTransport} = await import('../cloudDrive/mockTransport')
    const {createDriveSourceAdapter} = await import('../mediaSources/driveAdapter')
    const {recordDriveLocation} = await import('../mediaSources/locations')
    transport = createMockDriveTransport()
    const object = await transport.getFileMeta('mock-video-sample')
    createMediaRepository(db.drizzle).updateById(id, {path: 'gdrive://mock-video-sample'})
    recordDriveLocation(db, id, object.id, `${object.size}:${object.modifiedTime}`)
    service = createOriginalOperationsService(db, {open: async () => createDriveSourceAdapter(transport, true), directory: path.join(directory, 'spool')})
  })
  it('renames, moves and deletes the same Drive ID, retaining all card metadata', async () => {
    const before = metadata()
    const folder = await transport.originals!.create('destination', 'root', 'Destination')
    const result = await run([
      {kind: 'rename', mediaId: id, target: {connectionId: 'google-drive', key: 'root', name: 'renamed.mp4'}, conflict: 'fail'},
      {kind: 'move', mediaId: id, target: {connectionId: 'google-drive', key: folder.id, name: 'renamed.mp4'}, conflict: 'fail'},
      {kind: 'delete', mediaId: id, confirmDelete: true, conflict: 'fail'},
    ])
    expect(result.state, JSON.stringify(result)).toBe('completed')
    expect(card().path).toBe('gdrive://mock-video-sample')
    expect(card().basename).toBe('renamed.mp4'); expect(metadata()).toEqual(before)
    await expect(transport.getFileMeta('mock-video-sample')).rejects.toMatchObject({status: 404})
    expect(fixture.sqlite.prepare('SELECT availability FROM mediaLocations').get()).toEqual({availability: 'unavailable'})
  })
  it('uses a reserved ID to recover an upload whose successful reply was lost', async () => {
    const create = transport.originals!.create.bind(transport.originals)
    const spy = vi.spyOn(transport.originals!, 'create').mockImplementationOnce(async (...args) => { await create(...args); throw new Error('Lost response') })
    const generated = vi.spyOn(transport.originals!, 'generateId')
    const job = service.create({items: [{kind: 'upload', target: {connectionId: 'google-drive', key: 'root', name: 'new.mp4'}, uploadSize: 6, conflict: 'fail'}]})
    await service.upload(job.id, job.items[0].id, Readable.from(['upload']))
    expect((await finish(job)).state).toBe('failed')
    const retried = await finish(service.retry(job.id))
    expect(retried.state, JSON.stringify(retried)).toBe('completed')
    expect(spy).toHaveBeenCalledTimes(1); expect(generated).toHaveBeenCalledTimes(1)
    const listed = await transport.listFolder('root')
    expect(listed.files.filter(row => row.name === 'new.mp4')).toHaveLength(1)
    const downloaded = await transport.downloadFile(retried.items[0].drive!.fileId!)
    const chunks = []; for await (const chunk of downloaded.body as Readable) chunks.push(Buffer.from(chunk))
    expect(Buffer.concat(chunks).toString()).toBe('upload')
  })
  it('creates folders and handles duplicate names without touching an existing original', async () => {
    const created = await run([{kind: 'mkdir', target: {connectionId: 'google-drive', key: 'root', name: 'New folder'}, conflict: 'fail'}])
    expect(created.state).toBe('completed')
    const duplicate = await run([{kind: 'mkdir', target: {connectionId: 'google-drive', key: 'root', name: 'New folder'}, conflict: 'keep-both'}])
    expect(duplicate.state, JSON.stringify(duplicate)).toBe('completed')
    expect((await transport.listFolder('root')).files.map(file => file.name)).toContain('New folder (1)')
  })
  it('keeps a complete original when Drive content changes before a retry', async () => {
    let failed = false
    service.dispose()
    const {createDriveSourceAdapter} = await import('../mediaSources/driveAdapter')
    service = createOriginalOperationsService(db, {open: async () => createDriveSourceAdapter(transport, true), checkpoint(item) { if (!failed && item.phase === 'prepared') { failed = true; throw new Error('Interrupted') } }})
    const job = await run([{kind: 'delete', mediaId: id, confirmDelete: true, conflict: 'fail'}])
    const originalMeta = transport.getFileMeta.bind(transport)
    vi.spyOn(transport, 'getFileMeta').mockImplementation(async (...args) => ({...await originalMeta(...args), modifiedTime: '2030-01-01T00:00:00Z'}))
    const remove = vi.spyOn(transport.originals!, 'remove')
    expect((await finish(service.retry(job.id))).items[0].error).toBe('source_changed')
    expect(remove).not.toHaveBeenCalled()
  })
})
