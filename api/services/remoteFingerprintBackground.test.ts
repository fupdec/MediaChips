// @vitest-environment node
import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {createTestDb, closeTestDb, type TestDb} from '../db/testUtils/createTestDb'
import {createMediaRepository} from '../db/repositories/media'
import {createMediaTypesRepository} from '../db/repositories/mediaTypes'
import {createSettingsRepository} from '../db/repositories/settings'
import {createRemoteFingerprintBackground, REMOTE_OSHASH_SETTING} from './remoteFingerprintBackground'
import type {ApiDb} from '../types/db'
let fixture: TestDb, db: ApiDb
let worker: ReturnType<typeof createRemoteFingerprintBackground>
const backfill = vi.fn(async () => ({status: 'failed' as const, id: 1, path: '', message: 'offline'}))
beforeEach(() => {
  fixture = createTestDb('background-oshash'); db = {...fixture, path: fixture.dbPath}
  createMediaTypesRepository(db.drizzle).create({type: 'video', name: 'Video'})
  backfill.mockClear(); worker = createRemoteFingerprintBackground(db, {backfill})
})
afterEach(() => {worker.dispose(); closeTestDb(fixture)})
function add(path: string, extra = {}) {
  const repo = createMediaRepository(db.drizzle)
  const row = repo.create({path, filesize: 100, mediaTypeId: 1})
  repo.updateById(row.id, extra)
  return row
}
it('selects only live remote files without hashes, including legacy Drive', async () => {
  for (const prefix of ['nas', 'gdrive', 'onedrive', 'dropbox']) add(`${prefix}://file`)
  add('/local/video.mp4'); add('https://example.com/video')
  add('nas://hashed', {oshash: 'abc'}); add('nas://deleted', {deletedAt: '2026'})
  await worker.tick()
  expect(backfill).toHaveBeenCalledTimes(4)
  await worker.tick(); await worker.tick()
  expect(backfill).toHaveBeenCalledTimes(4)
})
it('honors the persisted switch and picks up later imports', async () => {
  add('nas://first')
  const settings = createSettingsRepository(db.drizzle)
  settings.upsertByOption(REMOTE_OSHASH_SETTING, '0')
  await worker.tick(); expect(backfill).not.toHaveBeenCalled()
  settings.upsertByOption(REMOTE_OSHASH_SETTING, '1')
  await worker.tick(); expect(backfill).toHaveBeenCalledTimes(1)
  add('gdrive://next'); await worker.tick()
  expect(backfill).toHaveBeenCalledTimes(2)
})
it('does not overlap ticks and stops the remaining batch when disabled', async () => {
  add('nas://one'); add('nas://two')
  backfill.mockImplementationOnce(async () => {
    await worker.tick()
    createSettingsRepository(db.drizzle).upsertByOption(REMOTE_OSHASH_SETTING, '0')
    return {status: 'failed', id: 1, path: '', message: 'offline'}
  })
  await worker.tick(); expect(backfill).toHaveBeenCalledTimes(1)
})
it('revisits files whose size becomes known after metadata processing', async () => {
  const unknown = add('nas://unknown', {filesize: 0}); add('nas://known')
  await worker.tick(); await worker.tick()
  createMediaRepository(db.drizzle).updateById(unknown.id, {filesize: 100})
  await worker.tick(); expect(backfill).toHaveBeenCalledTimes(2)
})
