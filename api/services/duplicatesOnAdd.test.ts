/**
 * @vitest-environment node
 */
import {afterEach, describe, expect, it, vi} from 'vitest'
import type {ApiDb} from '../types/db'
import {createTestDb, closeTestDb} from '../db/testUtils/createTestDb'
import {createSettingsRepository} from '../db/repositories/settings'
import {DUPLICATE_POLICY_SETTING, defaultDuplicatePolicy} from '../../shared/duplicateSimilarity'
import {DUPLICATES_ON_ADD_CURSOR_SETTING, DUPLICATES_ON_ADD_SETTING} from '../../shared/duplicatesOnAdd'
import {createDuplicatesOnAdd} from './duplicatesOnAdd'

describe('duplicatesOnAdd', () => {
  let db: ApiDb
  let dbPath: string
  let worker: ReturnType<typeof createDuplicatesOnAdd> | undefined

  afterEach(() => {
    worker?.dispose()
    if (db?.sqlite) closeTestDb({sqlite: db.sqlite, dbPath})
  })

  function setup() {
    const created = createTestDb('duplicates-on-add')
    dbPath = created.dbPath
    db = {sqlite: created.sqlite, drizzle: created.drizzle, path: created.dbPath} as ApiDb
    db.sqlite.exec(`INSERT INTO mediaTypes (id, type, createdAt, updatedAt) VALUES (1, 'video', '2026-01-01', '2026-01-01');`)
  }
  const insert = (id: number, path: string, oshash: string) => db.sqlite.prepare(`
    INSERT INTO media (id, path, name, filesize, oshash, mediaTypeId, createdAt, updatedAt)
    VALUES (?, ?, ?, 100, ?, 1, '2026-01-01', '2026-01-01')`).run(id, path, path, oshash)
  const cursor = () => createSettingsRepository(db.drizzle).findByOption(DUPLICATES_ON_ADD_CURSOR_SETTING)?.value

  it('starts after the existing library and reports duplicates of new cards', async () => {
    setup()
    insert(1, '/old/a.mp4', 'hash-a')
    const backfill = vi.fn()
    worker = createDuplicatesOnAdd(db, {backfill})
    await worker.tick()
    expect(cursor()).toBe('1')
    expect(worker.events().events).toEqual([])

    insert(2, 'gdrive://a', 'hash-a')
    insert(3, 'gdrive://b', 'hash-b')
    await worker.tick()
    expect(cursor()).toBe('3')
    const {events, seq} = worker.events()
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({kind: 'found', mediaId: 2})
    expect([...events[0].itemIds].sort()).toEqual([1, 2])
    expect(worker.events(seq).events).toEqual([])
    expect(backfill).not.toHaveBeenCalled()
  })

  it('auto-merges when the maintenance policy says so, and only moves the watermark while disabled', async () => {
    setup()
    insert(1, '/old/a.mp4', 'hash-a')
    const settings = createSettingsRepository(db.drizzle)
    settings.upsertByOption(DUPLICATE_POLICY_SETTING, JSON.stringify({...defaultDuplicatePolicy(), autoMerge: true}))
    const merge = vi.fn(async (_db: ApiDb, input: {survivorId: number}) => ({survivor: {id: input.survivorId}})) as never
    worker = createDuplicatesOnAdd(db, {merge, backfill: vi.fn()})
    await worker.tick()

    settings.upsertByOption(DUPLICATES_ON_ADD_SETTING, '0')
    insert(2, 'gdrive://ignored', 'hash-a')
    await worker.tick()
    expect(cursor()).toBe('2')

    settings.upsertByOption(DUPLICATES_ON_ADD_SETTING, '1')
    insert(3, 'gdrive://a', 'hash-a')
    await worker.tick()
    const {events} = worker.events()
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({kind: 'merged', mediaId: 3})
    expect(merge).toHaveBeenCalledTimes(1)
  })

  it('can be paused, resumed and told to skip pending cards', async () => {
    setup()
    insert(1, '/old/a.mp4', 'hash-a')
    worker = createDuplicatesOnAdd(db, {backfill: vi.fn()})
    await worker.tick()

    insert(2, 'gdrive://a', 'hash-a')
    expect(worker.pause()).toMatchObject({state: 'paused', pending: 1})
    await worker.tick()
    expect(cursor()).toBe('1')
    expect(worker.events().events).toEqual([])

    worker.resume()
    await vi.waitFor(() => expect(worker!.status()).toMatchObject({state: 'idle', pending: 0}))
    expect(worker.events().events).toHaveLength(1)

    insert(3, 'gdrive://b', 'hash-a')
    insert(4, 'gdrive://c', 'hash-a')
    worker.pause()
    expect(worker.skip()).toMatchObject({state: 'idle', pending: 0})
    expect(cursor()).toBe('4')
    worker.resume()
    await vi.waitFor(() => expect(worker!.status().state).toBe('idle'))
    expect(worker.events().events).toHaveLength(1)
  })
})
