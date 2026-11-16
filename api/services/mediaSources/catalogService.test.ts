// @vitest-environment node
import fs from 'fs'
import os from 'os'
import path from 'path'
import {Readable, PassThrough} from 'stream'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createTestDb, closeTestDb, type TestDb} from '../../db/testUtils/createTestDb'
import {createMediaRepository} from '../../db/repositories/media'
import type {ApiDb} from '../../types/db'
import {createSourceCatalogService} from './catalogService'
import {getOfflineFile, offlineDirectory} from './offline'
import {collectCatalog} from './reconcile'
import {createApiDb} from '../../createApiDb'
import {setActiveConnection} from '../../db/connectionHolder'
import {applyBulkMetaEdit} from '../bulkMetaEdit'
import type {SourceObject, SourceReadAdapter} from './adapter'
import {READ_SOURCE_CAPABILITIES} from '../../../shared/mediaSources'

const connectionId = '11111111-1111-4111-8111-111111111111'
const file = (key: string, version = 'v1', size = 4): SourceObject => ({resourceKey: key, name: path.posix.basename(key),
  size, version, isDirectory: false, contentType: 'video/mp4'})
const dir = (key: string): SourceObject => ({...file(key), isDirectory: true})

describe('complete catalog snapshots and offline tasks', () => {
  let fixture: TestDb
  let db: ApiDb
  let directory: string
  let adapter: SourceReadAdapter
  let service: ReturnType<typeof createSourceCatalogService>
  beforeEach(() => {
    fixture = createTestDb('source-catalog')
    db = {...fixture, path: fixture.dbPath}
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-offline-test-'))
    fixture.sqlite.exec(`INSERT INTO sourceConnections (id, provider, config, credentialRef, createdAt)
      VALUES ('${connectionId}', 'nas', '{}', 'secret', '2026');
      INSERT INTO mediaTypes (id, type, name, createdAt, updatedAt) VALUES (1, 'video', 'Videos', '2026', '2026');
      INSERT INTO meta (id, type, name, createdAt, updatedAt) VALUES (1, 'array', 'Tags', '2026', '2026'), (2, 'string', 'Notes', '2026', '2026');
      INSERT INTO tags (id, metaId, name, createdAt, updatedAt) VALUES (1, 1, 'User chip', '2026', '2026');`)
    adapter = {provider: 'nas', capabilities: READ_SOURCE_CAPABILITIES,
      list: vi.fn(async () => ({entries: [file('one.mp4'), file('two.mp4')]})),
      stat: vi.fn(async key => file(key)), read: vi.fn(async () => ({status: 200, headers: {}, body: Readable.from([Buffer.from('data')])})), close: vi.fn()}
    service = createSourceCatalogService(db, {open: async () => adapter, cacheBase: directory})
  })
  afterEach(() => { service.dispose(); closeTestDb(fixture); fs.rmSync(directory, {recursive: true, force: true}) })
  const root = (rootKey = '', intervalMinutes = 0) => service.saveRoot({connectionId, rootKey, intervalMinutes, name: 'Test folder'})
  const finish = async (id: string) => {
    await vi.waitFor(() => expect(service.job(id).state).not.toBe('running'))
    return service.job(id)
  }
  const refresh = async (id: string) => finish(service.refresh(id).id)
  const location = (id: number) => fixture.sqlite.prepare('SELECT * FROM mediaLocations WHERE mediaId = ?').get(id) as {id: string; version: string; availability: string}

  it('adds, changes and marks missing originals without changing user chips or card identity', async () => {
    const folder = root()
    expect((await refresh(folder.id)).result).toMatchObject({new: 2, changed: 0, missing: 0})
    expect(fixture.sqlite.prepare('SELECT reasons FROM copyDiscoveryAutoRequests').all()).toEqual([{reasons: JSON.stringify(['folder_update'])}])
    const repo = createMediaRepository(db.drizzle)
    const first = repo.findAllRaw().find(row => row.basename === 'one.mp4')!
    const second = repo.findAllRaw().find(row => row.basename === 'two.mp4')!
    repo.updateById(first.id, {name: 'My custom title', rating: 4, favorite: true, bookmark: 'Keep me'})
    await applyBulkMetaEdit(db, {itemType: 'media', itemIds: [first.id, second.id], changes: [
      {metaId: 1, metaType: 'array', editType: 2, value: [1]}, {metaId: 2, metaType: 'string', editType: 2, value: 'My notes'},
    ]})
    const chips = fixture.sqlite.prepare('SELECT * FROM tagsInMedia ORDER BY mediaId, tagId').all()
    const values = fixture.sqlite.prepare('SELECT * FROM valuesInMedia ORDER BY mediaId, metaId').all()
    adapter.list = vi.fn(async () => ({entries: [file('one.mp4', 'v2', 8), file('three.mp4')]}))
    const result = await refresh(folder.id)
    expect(result).toMatchObject({state: 'completed', result: {new: 1, changed: 1, missing: 1, scanned: 2}})
    expect(repo.findAllRaw()).toHaveLength(3)
    expect(repo.findById(first.id)).toMatchObject({path: first.path, filesize: 8, name: 'My custom title', rating: 4, favorite: true, bookmark: 'Keep me', deletedAt: null})
    expect(repo.findById(second.id)?.deletedAt).toBeNull()
    expect(location(first.id)).toMatchObject({version: 'v2', availability: 'available'})
    expect(location(second.id).availability).toBe('unavailable')
    expect(fixture.sqlite.prepare('SELECT * FROM tagsInMedia ORDER BY mediaId, tagId').all()).toEqual(chips)
    expect(fixture.sqlite.prepare('SELECT * FROM valuesInMedia ORDER BY mediaId, metaId').all()).toEqual(values)
    expect((await refresh(folder.id)).result).toMatchObject({new: 0, changed: 0, missing: 1})
    expect(adapter.close).toHaveBeenCalledTimes(3)
  })

  it('does not publish the first page or missing observations if a later page fails', async () => {
    const folder = root()
    await refresh(folder.id)
    const before = fixture.sqlite.prepare('SELECT * FROM mediaLocations').all()
    const snapshot = service.roots()[0].lastCompletedAt
    adapter.list = vi.fn(async (_key, token) => {
      if (token) throw new Error('private-secret-error')
      return {entries: [file('new.mp4')], nextPageToken: 'next'}
    })
    expect(await refresh(folder.id)).toMatchObject({state: 'failed', error: 'source_update_failed'})
    expect(createMediaRepository(db.drizzle).findAllRaw()).toHaveLength(2)
    expect(fixture.sqlite.prepare('SELECT * FROM mediaLocations').all()).toEqual(before)
    expect(service.roots()[0].lastCompletedAt).toBe(snapshot)
    expect(JSON.stringify(service.roots())).not.toContain('private-secret-error')
  })

  it('cancels a walk after a completed page without marking unseen files missing', async () => {
    const folder = root()
    await refresh(folder.id)
    let entered = false
    adapter.list = vi.fn(async (_key, token, signal) => {
      if (!token) return {entries: [file('one.mp4', 'v2')], nextPageToken: 'next'}
      entered = true
      return await new Promise<import('./adapter').SourcePage>((_resolve, reject) => signal!.addEventListener('abort', () => reject(signal!.reason), {once: true}))
    })
    const job = service.refresh(folder.id)
    await vi.waitFor(() => expect(entered).toBe(true))
    service.cancel(job.id)
    expect((await finish(job.id)).state).toBe('cancelled')
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS n FROM mediaLocations WHERE availability = 'available' AND version = 'v1'").get()).toEqual({n: 2})
  })

  it('rolls back every change if applying a complete snapshot fails', async () => {
    const folder = root()
    adapter.list = vi.fn(async () => ({entries: [file('new.mp4'), {...file('image.jpg'), contentType: 'image/jpeg'}]}))
    expect(await refresh(folder.id)).toMatchObject({state: 'failed', error: 'media_type_unavailable'})
    expect(createMediaRepository(db.drizzle).findAllRaw()).toHaveLength(0)
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM mediaLocations').get()).toEqual({n: 0})
    expect(service.roots()[0].lastCompletedAt).toBeNull()
  })

  it('limits missing detection to the selected subtree and does not revive Trash', async () => {
    const folder = root()
    await refresh(folder.id)
    const cards = createMediaRepository(db.drizzle).findAllRaw()
    createMediaRepository(db.drizzle).updateById(cards[0].id, {deletedAt: '2026', trashOriginalPath: cards[0].path, path: `trash://${cards[0].id}`})
    await refresh(folder.id)
    expect(createMediaRepository(db.drizzle).findAllRaw()).toHaveLength(2)
    expect(createMediaRepository(db.drizzle).findById(cards[0].id)?.deletedAt).toBe('2026')
    adapter.list = vi.fn(async () => ({entries: []}))
    const child = root('child')
    expect((await refresh(child.id)).result?.missing).toBe(0)
    expect(location(cards[1].id).availability).toBe('available')
  })

  it('walks nested directories and continuations and rejects repeated page tokens', async () => {
    adapter.list = vi.fn(async (key, token) => key === 'sub' ? {entries: [file('sub/deep.mp4')]} : token ? {entries: [file('page2.mp4')]} : {entries: [dir('sub')], nextPageToken: '2'})
    const folder = root()
    expect((await refresh(folder.id)).result).toMatchObject({new: 2, scanned: 2})
    adapter.list = vi.fn(async () => ({entries: [], nextPageToken: 'same'}))
    await expect(collectCatalog(adapter, '', new AbortController().signal, () => {})).rejects.toMatchObject({code: 'invalid_pagination'})
  })

  it('persists schedules, runs due roots once and preserves complete snapshots on scheduled failure', async () => {
    let now = 1_000_000
    service = createSourceCatalogService(db, {open: async () => adapter, cacheBase: directory, now: () => now})
    const folder = root('', 60)
    service.tick()
    expect(service.jobs()).toHaveLength(0)
    now += 60 * 60_000
    service.tick(); service.tick()
    expect(service.jobs()).toHaveLength(1)
    await finish(service.jobs()[0].id)
    expect(service.roots()[0]).toMatchObject({intervalMinutes: 60, nextRunAt: now + 60 * 60_000})
    adapter.list = vi.fn(async () => { throw new Error('offline') })
    now += 60 * 60_000
    service.tick()
    await finish(service.jobs()[1].id)
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS n FROM mediaLocations WHERE availability = 'available'").get()).toEqual({n: 2})
    service.saveRoot({connectionId, rootKey: folder.rootKey, name: folder.name, intervalMinutes: 0})
    now += 60 * 60_000; service.tick()
    expect(service.jobs()).toHaveLength(2)
  })

  it('checks versions, enforces the limit and publishes only a complete offline file', async () => {
    const folder = root()
    await refresh(folder.id)
    const id = createMediaRepository(db.drizzle).findAllRaw()[0].id
    service.setLimit(3)
    expect(await finish(service.saveOffline(id).id)).toMatchObject({state: 'failed', error: 'offline_limit_exceeded'})
    expect(adapter.read).not.toHaveBeenCalled()
    service.setLimit(8)
    expect((await finish(service.saveOffline(id).id)).state).toBe('completed')
    expect(service.offlineStatus(id)).toMatchObject({state: 'ready', size: 4, usedBytes: 4, limitBytes: 8})
    const copy = getOfflineFile(db, id, offlineDirectory(db, directory))
    expect(fs.readFileSync(copy.filename!, 'utf8')).toBe('data')
    expect(() => service.setLimit(2)).toThrow('offline_limit_below_usage')
    adapter.list = vi.fn(async () => ({entries: [file('one.mp4', 'v2'), file('two.mp4')]}))
    await refresh(folder.id)
    expect(service.offlineStatus(id).state).toBe('stale')
    adapter.stat = vi.fn(async key => file(key, 'v2'))
    expect((await finish(service.saveOffline(id).id)).state).toBe('completed')
    expect(service.offlineStatus(id).state).toBe('ready')
    expect(fs.existsSync(copy.filename!)).toBe(false)
    expect(fs.readdirSync(offlineDirectory(db, directory))).toHaveLength(1)
    service.removeOffline(id)
    expect(service.offlineStatus(id)).toMatchObject({state: 'absent', usedBytes: 0})
  })

  it.each(['changed', 'short', 'oversize'] as const)('rejects a %s download and leaves no playable or partial file', async mode => {
    const folder = root(); await refresh(folder.id)
    const id = createMediaRepository(db.drizzle).findAllRaw()[0].id
    if (mode === 'changed') adapter.stat = vi.fn().mockResolvedValueOnce(file('one.mp4')).mockResolvedValueOnce(file('one.mp4', 'v2'))
    else adapter.read = vi.fn(async () => ({status: 200, headers: {}, body: Readable.from([Buffer.from(mode === 'short' ? 'x' : 'oversize')])}))
    expect((await finish(service.saveOffline(id).id)).state).toBe('failed')
    expect(service.offlineStatus(id).state).toBe('absent')
    expect(fs.readdirSync(offlineDirectory(db, directory))).toEqual([])
  })

  it('cancels a streaming offline task and rejects concurrent writers and limit changes', async () => {
    const folder = root(); await refresh(folder.id)
    const id = createMediaRepository(db.drizzle).findAllRaw()[0].id
    const body = new PassThrough()
    adapter.read = vi.fn(async () => ({status: 200, headers: {}, body}))
    const job = service.saveOffline(id)
    await vi.waitFor(() => expect(adapter.read).toHaveBeenCalled())
    body.write('da')
    expect(() => service.saveOffline(id)).toThrow('source_busy')
    expect(() => service.setLimit(100)).toThrow('source_busy')
    service.cancel(job.id)
    expect((await finish(job.id)).state).toBe('cancelled')
    expect(body.destroyed).toBe(true)
    expect(fs.readdirSync(offlineDirectory(db, directory))).toEqual([])
  })

  it('never commits into another library through stable database proxies', async () => {
    const proxyDb = createApiDb({drizzleConnection: fixture, path: fixture.dbPath})
    const other = createTestDb('other-source-library')
    let release!: () => void
    adapter.list = vi.fn(async () => { await new Promise<void>(resolve => { release = resolve }); return {entries: [file('late.mp4')]} })
    service = createSourceCatalogService(proxyDb, {open: async () => adapter})
    const folder = root()
    const job = service.refresh(folder.id)
    await vi.waitFor(() => expect(release).toBeDefined())
    setActiveConnection(other)
    release()
    await vi.waitFor(() => expect(adapter.close).toHaveBeenCalled())
    setActiveConnection(fixture)
    expect(service.job(job.id)).toMatchObject({state: 'failed', error: 'library_changed'})
    expect(createMediaRepository(fixture.drizzle).findAllRaw()).toEqual([])
    expect(createMediaRepository(other.drizzle).findAllRaw()).toEqual([])
    closeTestDb(other)
  })

  it('tracks Drive folder membership after a successful baseline and preserves custom titles on rename', async () => {
    fixture.sqlite.exec(`UPDATE sourceConnections SET provider = 'gdrive' WHERE id = '${connectionId}'`)
    adapter = {...adapter, provider: 'gdrive'}
    adapter.list = vi.fn(async () => ({entries: [{...file('one.mp4'), resourceKey: 'drive-one'}, {...file('two.mp4'), resourceKey: 'drive-two'}]}))
    const folder = root('drive-folder')
    await refresh(folder.id)
    const id = createMediaRepository(db.drizzle).findAllRaw()[0].id
    createMediaRepository(db.drizzle).updateById(id, {name: 'My Drive title'})
    adapter.list = vi.fn(async () => ({entries: [{...file('one.mp4', 'v2'), resourceKey: 'drive-one', name: 'renamed.mp4'}]}))
    expect((await refresh(folder.id)).result).toMatchObject({new: 0, changed: 1, missing: 1})
    expect(createMediaRepository(db.drizzle).findById(id)?.name).toBe('My Drive title')
  })
  it('invalidates a ready copy when explicit version verification finds a newer original', async () => {
    const folder = root(); await refresh(folder.id)
    const id = createMediaRepository(db.drizzle).findAllRaw()[0].id
    expect((await finish(service.saveOffline(id).id)).state).toBe('completed')
    adapter.stat = vi.fn(async key => file(key, 'v2'))
    expect(await finish(service.saveOffline(id).id)).toMatchObject({state: 'failed', error: 'source_version_changed'})
    expect(service.offlineStatus(id).state).toBe('stale')
    expect(location(id).version).toBe('v1')
  })

  it('does not starve two due schedules sharing one source', async () => {
    let now = 1_000_000
    service = createSourceCatalogService(db, {open: async () => adapter, cacheBase: directory, now: () => now})
    root('', 60); root('child', 60)
    adapter.list = vi.fn(async key => ({entries: key ? [file('child/child.mp4')] : [file('one.mp4')]}))
    now += 60 * 60_000
    service.tick()
    await finish(service.jobs()[0].id)
    service.tick()
    await finish(service.jobs()[1].id)
    expect(service.roots().every(row => row.lastCompletedAt !== null)).toBe(true)
  })

  it('preserves edits made while a scan is in progress', async () => {
    const folder = root(); await refresh(folder.id)
    const repo = createMediaRepository(db.drizzle)
    const id = repo.findAllRaw()[0].id
    let release!: () => void
    adapter.list = vi.fn(async () => { await new Promise<void>(resolve => { release = resolve }); return {entries: [file('one.mp4', 'v2')]} })
    const job = service.refresh(folder.id)
    await vi.waitFor(() => expect(release).toBeDefined())
    repo.updateById(id, {name: 'Edited during scan', rating: 5})
    await applyBulkMetaEdit(db, {itemType: 'media', itemIds: [id], changes: [{metaId: 1, metaType: 'array', editType: 2, value: [1]}]})
    release()
    expect((await finish(job.id)).state).toBe('completed')
    expect(repo.findById(id)).toMatchObject({name: 'Edited during scan', rating: 5})
    expect(fixture.sqlite.prepare('SELECT tagId FROM tagsInMedia WHERE mediaId = ?').all(id)).toEqual([{tagId: 1}])
  })

  it('reconciles a reverted legacy NAS version without duplicate-location conflicts or losing cards', async () => {
    const folder = root(); await refresh(folder.id)
    const repo = createMediaRepository(db.drizzle)
    const oldId = repo.findAllRaw()[0].id
    const newer = repo.create({path: `nas://${connectionId}/one.mp4?v=${'a'.repeat(64)}`, name: 'Newer version custom title', mediaTypeId: 1, filesize: 4})
    fixture.sqlite.prepare('INSERT INTO mediaLocations (id, mediaId, connectionId, resourceKey, version, availability) VALUES (?, ?, ?, ?, ?, ?)')
      .run('newer-location', newer.id, connectionId, 'one.mp4', 'v2', 'available')
    expect((await refresh(folder.id)).result).toMatchObject({new: 0, changed: 1, missing: 0})
    expect(repo.findById(newer.id)?.name).toBe('Newer version custom title')
    expect(location(oldId).availability).toBe('available')
    expect(location(newer.id).availability).toBe('unavailable')
    expect((await refresh(folder.id)).result?.changed).toBe(0)
  })

  it('distinguishes an existing empty or renamed unsupported file from a missing original', async () => {
    const folder = root(); await refresh(folder.id)
    const id = createMediaRepository(db.drizzle).findAllRaw()[0].id
    adapter.list = vi.fn(async () => ({entries: [file('one.mp4', 'v2', 0), file('two.mp4'), file('notes.txt')]}))
    expect((await refresh(folder.id)).result).toMatchObject({new: 0, changed: 1, missing: 0, scanned: 3})
    expect(createMediaRepository(db.drizzle).findAllRaw()).toHaveLength(2)
    expect(location(id)).toMatchObject({version: 'v2', availability: 'available'})
    expect(createMediaRepository(db.drizzle).findById(id)?.filesize).toBe(0)
  })

})
