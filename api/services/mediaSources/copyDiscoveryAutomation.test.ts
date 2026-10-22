// @vitest-environment node
import fs from 'fs'
import os from 'os'
import path from 'path'
import {beforeEach, afterEach, describe, it, expect} from 'vitest'
import {createTestDb, closeTestDb, type TestDb} from '../../db/testUtils/createTestDb'
import {createSettingsRepository} from '../../db/repositories/settings'
import {createMediaRepository} from '../../db/repositories/media'
import type {ApiDb} from '../../types/db'
import {createCopyDiscoveryService} from './copyDiscovery'
import {createCopyDiscoveryAutomation} from './copyDiscoveryAutomation'
import {requestAutomaticCopyDiscovery, rememberCopyDiscoveryRoot, COPY_TRIGGER_SETTINGS} from './copyDiscoveryTriggers'
import {copyCandidates} from './copies'
import type {CopyDiscoveryTrigger} from '../../../shared/copyDiscovery'

describe('automatic discovery triggers', () => {
  let fixture: TestDb, db: ApiDb, directory: string, time: number
  let discovery: ReturnType<typeof createCopyDiscoveryService>
  const workers: ReturnType<typeof createCopyDiscoveryAutomation>[] = []
  const automation = (probe: (key: string) => Promise<{identity: string} | null> = async () => ({identity: 'disk-one'})) => {
    const result = createCopyDiscoveryAutomation(db, discovery, {now: () => time, probe}); workers.push(result); return result
  }
  const setting = (trigger: CopyDiscoveryTrigger, enabled: boolean) => createSettingsRepository(db.drizzle).upsertByOption(COPY_TRIGGER_SETTINGS[trigger], enabled ? '1' : '0')
  const jobs = () => discovery.jobs()
  const complete = () => fixture.sqlite.prepare("UPDATE copyDiscoveryJobs SET state = 'completed'").run()
  const notify = (key: string, trigger: CopyDiscoveryTrigger = 'folder_update', monitor = false) => requestAutomaticCopyDiscovery(db, [{key}], trigger, {now: time, monitor})
  beforeEach(() => {
    fixture = createTestDb('copy-auto'); db = {...fixture}; time = 100_000
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-copy-auto-'))
    fixture.sqlite.exec("INSERT INTO mediaTypes (id,type,name,createdAt,updatedAt) VALUES (1,'video','Videos','2026','2026')")
    discovery = createCopyDiscoveryService(db)
  })
  afterEach(() => {
    discovery.dispose(); workers.splice(0).forEach(worker => worker.dispose())
    closeTestDb(fixture); fs.rmSync(directory, {recursive: true, force: true})
  })

  it('debounces repeated events durably and records the trigger', async () => {
    for (let n = 0; n < 20; n++) notify(directory)
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM copyDiscoveryAutoRequests').get()).toEqual({n: 1})
    const worker = automation(); time += 1999; await worker.tick(); expect(jobs()).toHaveLength(0)
    time++; await worker.tick()
    expect(jobs()).toHaveLength(1)
    expect(jobs()[0]).toMatchObject({triggers: ['folder_update'], roots: [{key: directory}]})
    await worker.tick(); expect(jobs()).toHaveLength(1)
  })

  it('keeps one follow-up generation for a burst received during a running scan', async () => {
    const worker = automation(); notify(directory); time += 2000; await worker.tick()
    fixture.sqlite.prepare("UPDATE copyDiscoveryJobs SET state = 'verifying'").run()
    for (let n = 0; n < 30; n++) notify(directory)
    time += 10_000; await worker.tick(); expect(jobs()).toHaveLength(1)
    complete(); await worker.tick(); expect(jobs()).toHaveLength(2)
    complete(); await worker.tick(); await worker.tick(); expect(jobs()).toHaveLength(2)
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM copyDiscoveryAutoRequests').get()).toEqual({n: 0})
  })

  it('recovers queued events and follow-ups after a scheduler restart', async () => {
    notify(directory); const first = automation(); first.dispose()
    const second = automation(); time += 2000; await second.tick(); expect(jobs()).toHaveLength(1)
    notify(directory); second.dispose(); complete()
    time += 2000; await automation().tick(); expect(jobs()).toHaveLength(2)
  })

  it('detects reconnects once, persists the baseline and detects replacement at the same path', async () => {
    rememberCopyDiscoveryRoot(db, {key: directory}, 'manual')
    let observed: {identity: string} | null = null
    const worker = automation(async () => observed)
    await worker.tick(); expect(jobs()).toHaveLength(0)
    observed = {identity: 'volume-a'}; time += 5000; await worker.tick()
    time += 2000; await worker.tick(); expect(jobs()[0].triggers).toEqual(['reconnect'])
    complete(); await worker.tick()
    worker.dispose(); time += 5000
    const restarted = automation(async () => observed); await restarted.tick(); time += 2000; await restarted.tick()
    expect(jobs()).toHaveLength(1)
    observed = {identity: 'volume-b'}; time += 5000; await restarted.tick()
    time += 2000; await restarted.tick(); expect(jobs()).toHaveLength(2)
  })

  it('does not duplicate an initial manual scan already covering a new monitored root', async () => {
    discovery.create({roots: [{key: directory}]})
    const worker = automation(); await worker.tick(); time += 2000; await worker.tick()
    expect(jobs()).toHaveLength(1)
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM copyDiscoveryAutoRequests').get()).toEqual({n: 0})
  })

  it('does not interpret a permission failure or timeout as a disconnect', async () => {
    rememberCopyDiscoveryRoot(db, {key: directory}, 'manual')
    fixture.sqlite.prepare("UPDATE copyDiscoveryAutoRoots SET available = 1, identity = 'known'").run()
    await automation(async () => { throw new Error('permission denied') }).tick()
    expect(fixture.sqlite.prepare('SELECT available, identity FROM copyDiscoveryAutoRoots').get()).toEqual({available: 1, identity: 'known'})
    expect(jobs()).toHaveLength(0)
  })

  it('respects per-trigger settings, including disabling an already debounced request', async () => {
    for (const trigger of ['import', 'folder_update', 'reconnect'] as const) {
      setting(trigger, false); notify(directory, trigger)
    }
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM copyDiscoveryAutoRequests').get()).toEqual({n: 0})
    setting('folder_update', true); notify(directory); setting('folder_update', false)
    time += 2000; await automation().tick(); expect(jobs()).toHaveLength(0)
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM copyDiscoveryAutoRequests').get()).toEqual({n: 0})
  })

  it('checks a known search folder after importing a new reference and automatically links its copy', async () => {
    setting('reconnect', false)
    const archive = path.join(directory, 'archive'); fs.mkdirSync(archive)
    const original = path.join(directory, 'original.mp4'), copy = path.join(archive, 'renamed.mp4')
    fs.writeFileSync(original, 'some identical media bytes'); fs.copyFileSync(original, copy)
    const card = createMediaRepository(db.drizzle).create({path: original, filesize: fs.statSync(original).size, mediaTypeId: 1})
    rememberCopyDiscoveryRoot(db, {key: archive}, 'manual')
    const worker = automation(); await worker.tick()
    notify(original, 'import'); time += 2000; await worker.tick()
    expect(jobs()[0].roots.map(root => root.key).sort()).toEqual([archive, original].sort())
    await discovery.tick()
    expect(copyCandidates(db, card.id)).toHaveLength(2)
    complete(); await worker.tick(); time += 20_000; await worker.tick()
    expect(jobs()).toHaveLength(1)
  })

  it('preserves watched exclusions and stops monitoring a removed watched root', async () => {
    const excluded = path.join(directory, 'skip')
    fixture.sqlite.prepare("INSERT INTO watchedFolders (path,watch,excludedPaths,createdAt,updatedAt) VALUES (?,1,?,'2026','2026')").run(directory, JSON.stringify([excluded]))
    const worker = automation(); await worker.tick()
    time += 2000; await worker.tick()
    expect(jobs()[0].roots).toEqual([{key: directory, excluded: [excluded]}])
    complete(); await worker.tick()
    fixture.sqlite.prepare('UPDATE watchedFolders SET watch = 0').run()
    time += 5000; await worker.tick()
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM copyDiscoveryAutoRoots WHERE monitor = 1').get()).toEqual({n: 0})
  })

  it('does not let disconnected roots starve available requests', async () => {
    for (let n = 0; n < 40; n++) {
      const key = path.join(directory, 'offline-' + n)
      rememberCopyDiscoveryRoot(db, {key}, 'manual'); notify(key)
    }
    fixture.sqlite.prepare('UPDATE copyDiscoveryAutoRoots SET available = 0').run()
    notify(path.join(directory, 'available.mp4'))
    time += 2000; await automation(async () => null).tick()
    expect(jobs()).toHaveLength(1)
    expect(jobs()[0].roots).toEqual([{key: path.join(directory, 'available.mp4')}])
  })

  it('does not publish reconnect observations into another library', async () => {
    db.path = 'first'
    rememberCopyDiscoveryRoot(db, {key: directory}, 'manual')
    const worker = automation(async () => { db.path = 'second'; return {identity: 'disk'} })
    await expect(worker.tick()).rejects.toMatchObject({code: 'library_changed'})
    expect(jobs()).toHaveLength(0)
    expect(fixture.sqlite.prepare('SELECT available FROM copyDiscoveryAutoRoots').get()).toEqual({available: null})
  })

  it('does not resubmit a failed or stopped automatic job without a new event', async () => {
    const worker = automation(); notify(directory); time += 2000; await worker.tick()
    fixture.sqlite.prepare("UPDATE copyDiscoveryJobs SET state = 'failed'").run()
    await worker.tick(); time += 20_000; await worker.tick(); expect(jobs()).toHaveLength(1)
    notify(directory); time += 2000; await worker.tick(); expect(jobs()).toHaveLength(2)
    fixture.sqlite.prepare("UPDATE copyDiscoveryJobs SET state = 'cancelled'").run()
    await worker.tick(); await worker.tick(); expect(jobs()).toHaveLength(2)
  })

  it('supports an empty NAS root and ignores a removed connection without blocking another source', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    fixture.sqlite.prepare("INSERT INTO sourceConnections (id,provider,config,credentialRef,createdAt) VALUES (?,'nas','{}','secret','2026')").run(id)
    requestAutomaticCopyDiscovery(db, [{connectionId: id, key: ''}], 'folder_update', {now: time})
    time += 2000; const worker = automation(); await worker.tick()
    expect(jobs()[0].roots).toEqual([{connectionId: id, key: ''}])
    complete(); await worker.tick()
    requestAutomaticCopyDiscovery(db, [{connectionId: 'removed', key: 'folder'}], 'folder_update', {now: time})
    notify(directory); time += 2000; await worker.tick()
    expect(jobs()).toHaveLength(2)
    expect(jobs()[0].roots).toEqual([{key: directory}])
  })

  it('keeps excluded files out of an automatic scan', async () => {
    const archive = path.join(directory, 'archive'), skip = path.join(archive, 'private')
    fs.mkdirSync(skip, {recursive: true})
    const original = path.join(directory, 'original.mp4')
    fs.writeFileSync(original, 'the same video contents')
    const row = createMediaRepository(db.drizzle).create({path: original, filesize: fs.statSync(original).size, mediaTypeId: 1})
    fs.copyFileSync(original, path.join(skip, 'copy.mp4'))
    requestAutomaticCopyDiscovery(db, [{key: archive, excluded: [skip]}], 'folder_update', {now: time})
    time += 2000; const worker = automation(); await worker.tick(); await discovery.tick()
    expect(jobs()[0]).toMatchObject({state: 'completed', total: 0})
    expect(copyCandidates(db, row.id)).toHaveLength(1)
  })
})
