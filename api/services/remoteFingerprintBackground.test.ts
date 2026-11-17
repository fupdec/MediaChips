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
import {DUPLICATE_POLICY_SETTING} from '../../shared/duplicateSimilarity'
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

const GB = 1024 ** 3
const calledPaths = () => (backfill.mock.calls as unknown as [unknown, {path: string}][]).map(call => call[1].path)
it('hashes large same-size pairs first, largest first, before the id-ordered queue', async () => {
  for (let i = 0; i < 6; i++) add(`nas://small-${i}`)
  add('nas://lonely-big', {filesize: 9 * GB})
  add('/local/a.mkv', {filesize: 2 * GB}); add('gdrive://a-copy.mkv', {filesize: 2 * GB})
  add('/local/b.mkv', {filesize: 4 * GB}); add('onedrive://b-copy.mkv', {filesize: 4 * GB, oshash: 'known'})
  await worker.tick()
  // b-copy already has a fingerprint; its partner still gets hashed so the pair can be confirmed.
  expect(calledPaths()).toEqual(['/local/b.mkv', '/local/a.mkv', 'gdrive://a-copy.mkv', 'nas://small-0'])
})
it('ignores pairs below the threshold, of another media type, or with deleted partners', async () => {
  add('nas://first')
  createMediaTypesRepository(db.drizzle).create({type: 'image', name: 'Image'})
  add('/local/x.mkv', {filesize: 100 * 1024 * 1024}); add('nas://x.mkv', {filesize: 100 * 1024 * 1024, oshash: 'h'})
  add('/local/y.mkv', {filesize: GB}); add('nas://y.jpg', {filesize: GB, mediaTypeId: 2, oshash: 'h'})
  // z differs from y by one byte: two live local cards of the same size and type are a real pair.
  add('/local/z.mkv', {filesize: GB + 1}); add('nas://z.mkv', {filesize: GB + 1, oshash: 'h', deletedAt: '2026'})
  await worker.tick()
  expect(calledPaths()[0]).toBe('nas://first')
})
it('can be disabled through the duplicate policy', async () => {
  createSettingsRepository(db.drizzle).upsertByOption(DUPLICATE_POLICY_SETTING, JSON.stringify({sizeCandidateMinBytes: 0}))
  add('nas://first'); add('/local/a.mkv', {filesize: GB}); add('gdrive://a.mkv', {filesize: GB})
  await worker.tick()
  expect(calledPaths()).toEqual(['nas://first', '/local/a.mkv', 'gdrive://a.mkv'])
})
it('does not retry a failed priority candidate in the same session', async () => {
  add('/local/a.mkv', {filesize: GB}); add('gdrive://a.mkv', {filesize: GB, oshash: 'h'})
  await worker.tick(); await worker.tick()
  expect(calledPaths().filter(path => path === '/local/a.mkv')).toHaveLength(1)
})
