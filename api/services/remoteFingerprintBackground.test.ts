// @vitest-environment node
import {writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {computeOshashForPath} from './oshash'
import {listMediaDuplicateGroups} from './mediaDuplicateGroups'
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
it('selects live remote files and eligible local candidates without hashes', async () => {
  for (const prefix of ['nas', 'gdrive', 'onedrive', 'dropbox']) add(`${prefix}://file`)
  add('/local/video.mp4'); add('https://example.com/video')
  add('nas://hashed', {oshash: 'abc'}); add('nas://deleted', {deletedAt: '2026'})
  await worker.tick()
  expect(backfill).toHaveBeenCalledTimes(4)
  await worker.tick(); await worker.tick()
  expect(backfill).toHaveBeenCalledTimes(5)
  expect(backfill).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({path: '/local/video.mp4'}), expect.anything())
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

it.each(['nas', 'gdrive'])('groups a %s import with an older local card by fingerprint', async provider => {
  worker.dispose()
  worker = createRemoteFingerprintBackground(db)
  const path = join(dirname(fixture.dbPath), 'original.mp4')
  writeFileSync(path, Buffer.alloc(100, 42))
  const local = add(path)
  const remote = add(`${provider}://renamed`, {oshash: await computeOshashForPath(path)})
  await worker.tick()
  const {groups} = listMediaDuplicateGroups(db, {duplicatesBy: 'oshash', mediaTypeId: 1})
  expect(groups).toHaveLength(1)
  expect(groups[0].itemIds).toEqual(expect.arrayContaining([local.id, remote.id]))
})
