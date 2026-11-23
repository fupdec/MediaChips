// @vitest-environment node
import fs from 'fs'
import os from 'os'
import path from 'path'
import {Readable, PassThrough} from 'stream'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {CHUNK_SIZE, computeOshash, computeOshashFromChunks} from '../oshash'
import {createNasSourceAdapter} from './nasAdapter'
import {createDriveSourceAdapter} from './driveAdapter'
import {createMockDriveTransport, MOCK_FILE_SIZE} from '../cloudDrive/mockTransport'
import {computeSourceOshash} from './oshash'
import {READ_SOURCE_CAPABILITIES} from '../../../shared/mediaSources'
import type {SourceObject, SourceReadAdapter} from './adapter'
import {createTestDb, closeTestDb, type TestDb} from '../../db/testUtils/createTestDb'
import {createMediaRepository} from '../../db/repositories/media'
import type {ApiDb} from '../../types/db'
import * as context from './context'
import {backfillMediaFingerprint, getFingerprintBackfillStatus, iterateFingerprintBackfill} from '../mediaFingerprintBackfill'
import {listMediaDuplicateGroups} from '../mediaDuplicateGroups'

const bigSize = 50 * 1024 ** 3 + 17
const head = Buffer.alloc(CHUNK_SIZE, 11)
const tail = Buffer.alloc(CHUNK_SIZE, 37)
const object = (size = bigSize, version = 'v1'): SourceObject => ({resourceKey: 'movie', name: 'movie.mp4',
  size, version, isDirectory: false, contentType: 'video/mp4'})
function fixture(size = bigSize) {
  const reads = vi.fn(async (_key: string, range: string | undefined) => {
    if (!range) throw new Error('Full file download is forbidden')
    const match = /^bytes=(\d+)-(\d+)$/.exec(range)!
    const start = Number(match[1]), end = Number(match[2])
    return {status: 206, headers: {'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1)},
      body: Readable.from([start === 0 ? head.subarray(0, end + 1) : tail.subarray(0, end - start + 1)])}
  })
  const closes = vi.fn()
  const stat = vi.fn(async () => object(size))
  const open = vi.fn(async (): Promise<SourceReadAdapter> => ({provider: 'nas', capabilities: READ_SOURCE_CAPABILITIES,
    list: async () => ({entries: []}), stat, read: reads, close: closes}))
  return {open, reads, closes, stat}
}

describe('bounded remote oshash', () => {
  it('reads only 128 KiB for a 50 GiB file and matches the local algorithm', async () => {
    const source = fixture()
    const result = await computeSourceOshash(source.open, 'movie')
    expect(result.value).toBe(computeOshashFromChunks(bigSize, head, tail))
    expect(result.size).toBe(bigSize)
    expect(source.reads.mock.calls.map(call => call[1])).toEqual([
      'bytes=0-65535', `bytes=${bigSize - CHUNK_SIZE}-${bigSize - 1}`,
    ])
    expect(source.closes).toHaveBeenCalledTimes(3)
  })

  it.each([9, 72, 65535, 65536, 100000, 2 * CHUNK_SIZE + 123])('matches a real local file of %i bytes, including overlapping samples', async size => {
    const bytes = Buffer.alloc(size)
    for (let index = 0; index < size; index++) bytes[index] = index % 251
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-remote-oshash-'))
    const filename = path.join(directory, 'movie.mp4')
    fs.writeFileSync(filename, bytes)
    const source = fixture(size)
    source.reads.mockImplementation(async (_key, range) => {
      const [, start, end] = /^bytes=(\d+)-(\d+)$/.exec(range!)!
      return {status: 206, headers: {'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(Number(end) - Number(start) + 1)},
        body: Readable.from([bytes.subarray(Number(start), Number(end) + 1)])}
    })
    try { expect((await computeSourceOshash(source.open, 'movie')).value).toBe(await computeOshash(filename)) }
    finally { fs.rmSync(directory, {recursive: true, force: true}) }
  })

  it('ignores different middle bytes when the ends and size match', async () => {
    const original = Buffer.alloc(1024 * 1024, 7)
    const modified = Buffer.from(original)
    modified.fill(99, CHUNK_SIZE, modified.length - CHUNK_SIZE)
    const source = fixture(original.length)
    source.reads.mockImplementation(async (key, range) => {
      const bytes = key === 'original' ? original : modified
      const [, start, end] = /^bytes=(\d+)-(\d+)$/.exec(range!)!
      return {status: 206, headers: {'content-range': `bytes ${start}-${end}/${bytes.length}`, 'content-length': String(Number(end) - Number(start) + 1)},
        body: Readable.from([bytes.subarray(Number(start), Number(end) + 1)])}
    })
    const first = await computeSourceOshash(source.open, 'original')
    const second = await computeSourceOshash(source.open, 'modified')
    expect(first.value).toBe(second.value)
    expect(original.equals(modified)).toBe(false)
  })

  it('uses exact offset bounds through the NAS adapter', async () => {
    const read = vi.fn(async (_key: string, start: number, _end: number) => Readable.from([start === 0 ? head : tail]))
    const open = async () => createNasSourceAdapter({list: async () => [],
      stat: async () => ({size: bigSize, modifiedAt: 1000, isDirectory: false}), read, close() {}})
    expect((await computeSourceOshash(open, 'movie.mp4')).value).toBe(computeOshashFromChunks(bigSize, head, tail))
    expect(read.mock.calls).toEqual([['movie.mp4', 0, CHUNK_SIZE - 1], ['movie.mp4', bigSize - CHUNK_SIZE, bigSize - 1]])
  })

  it('forwards only the two ranges to the Google Drive transport', async () => {
    const transport = createMockDriveTransport()
    const read = vi.spyOn(transport, 'downloadFile')
    await computeSourceOshash(async () => createDriveSourceAdapter(transport), 'mock-video-sample')
    expect(read.mock.calls.map(call => call[1])).toEqual(['bytes=0-65535', `bytes=${MOCK_FILE_SIZE - CHUNK_SIZE}-${MOCK_FILE_SIZE - 1}`])
  })

  it('uses a fresh session after each read, including FTP transports that close at the range boundary', async () => {
    const source = fixture()
    const open = async () => {
      let used = false
      const adapter = await source.open()
      return {...adapter, stat: async () => { if (used) throw new Error('FTP session is closed'); return object() },
        read: async (...args: Parameters<SourceReadAdapter['read']>) => { if (used) throw new Error('FTP session is closed'); used = true; return adapter.read(...args) }}
    }
    expect((await computeSourceOshash(open, 'movie')).value).toBe(computeOshashFromChunks(bigSize, head, tail))
  })

  it('rejects an ignored range before consuming the full response', async () => {
    const source = fixture()
    const body = new PassThrough()
    const consumed = vi.fn(); body.on('data', consumed)
    source.reads.mockResolvedValue({status: 200, headers: {'content-length': String(bigSize), 'content-range': ''}, body})
    await expect(computeSourceOshash(source.open, 'movie')).rejects.toMatchObject({code: 'range_not_supported'})
    expect(body.destroyed).toBe(true)
    expect(consumed).not.toHaveBeenCalled()
    expect(source.reads).toHaveBeenCalledTimes(1)
  })

  it.each(['wrong-range', 'short', 'long'])('rejects a %s response without saving an invalid fingerprint', async kind => {
    const source = fixture()
    source.reads.mockResolvedValue({status: 206, headers: {'content-length': String(CHUNK_SIZE),
      'content-range': kind === 'wrong-range' ? `bytes 1-65536/${bigSize}` : `bytes 0-65535/${bigSize}`},
      body: Readable.from([Buffer.alloc(kind === 'short' ? CHUNK_SIZE - 1 : kind === 'long' ? CHUNK_SIZE + 1 : CHUNK_SIZE)])})
    await expect(computeSourceOshash(source.open, 'movie')).rejects.toThrow()
    expect(source.reads).toHaveBeenCalledTimes(1)
    expect(source.closes).toHaveBeenCalledOnce()
  })

  it.each([2, 3])('rejects a version change at stat #%i', async call => {
    const source = fixture()
    let seen = 0
    source.stat.mockImplementation(async () => object(bigSize, ++seen >= call ? 'v2' : 'v1'))
    await expect(computeSourceOshash(source.open, 'movie')).rejects.toMatchObject({code: 'source_version_changed'})
  })

  it('cancels an in-flight sample and closes its stream and source', async () => {
    const source = fixture()
    const controller = new AbortController()
    const body = new PassThrough()
    source.reads.mockImplementation(async () => {
      queueMicrotask(() => controller.abort())
      return {status: 206, headers: {'content-range': `bytes 0-65535/${bigSize}`, 'content-length': String(CHUNK_SIZE)}, body}
    })
    await expect(computeSourceOshash(source.open, 'movie', {signal: controller.signal})).rejects.toThrow()
    expect(body.destroyed).toBe(true)
    expect(source.closes).toHaveBeenCalledOnce()
  })
})

describe('remote fingerprint backfill and duplicate search', () => {
  let testDb: TestDb
  let db: ApiDb
  let source: ReturnType<typeof fixture>
  const nas = '11111111-1111-4111-8111-111111111111'
  beforeEach(() => {
    testDb = createTestDb('remote-oshash')
    db = {...testDb, path: testDb.dbPath}
    testDb.sqlite.exec(`INSERT INTO mediaTypes (id, type, name, createdAt, updatedAt) VALUES (1, 'video', 'Videos', '2026', '2026');
      INSERT INTO sourceConnections (id, provider, config, credentialRef, createdAt) VALUES ('${nas}', 'nas', '{}', 'test', '2026'), ('google-drive', 'gdrive', '{}', 'test-drive', '2026');`)
    source = fixture()
    vi.spyOn(context, 'openSource').mockImplementation(async () => ({...await source.open()}))
  })
  afterEach(() => { vi.restoreAllMocks(); closeTestDb(testDb) })
  const add = (provider: 'nas' | 'gdrive') => {
    const repo = createMediaRepository(db.drizzle)
    const row = repo.create({path: provider === 'nas' ? `nas://${nas}/legacy.mp4` : 'gdrive://movie', mediaTypeId: 1, filesize: bigSize})
    testDb.sqlite.prepare('INSERT INTO mediaLocations (id, mediaId, connectionId, resourceKey, version) VALUES (?, ?, ?, ?, ?)')
      .run(provider, row.id, provider === 'nas' ? nas : 'google-drive', 'movie', 'v1')
    return {...row, filesize: bigSize, mediaType: 'video'}
  }

  it('fills NAS and Drive fingerprints, and finds duplicates together with local cards', async () => {
    const first = add('nas'), second = add('gdrive')
    const value = computeOshashFromChunks(bigSize, head, tail)
    const local = createMediaRepository(db.drizzle).create({path: '/local/movie.mp4', mediaTypeId: 1, filesize: bigSize})
    createMediaRepository(db.drizzle).updateById(local.id, {oshash: value})
    const events = []
    for await (const event of iterateFingerprintBackfill(db)) events.push(event)
    expect(events[events.length - 1]).toMatchObject({type: 'complete', hashed: 2, failed: 0, missing: 0})
    expect(createMediaRepository(db.drizzle).findById(first.id)?.oshash).toBe(value)
    expect(createMediaRepository(db.drizzle).findById(second.id)?.oshash).toBe(value)
    expect(await getFingerprintBackfillStatus(db)).toMatchObject({total: 3, pending: 0, hashed: 3})
    const groups = listMediaDuplicateGroups(db, {duplicatesBy: 'oshash', mediaTypeId: 1})
    expect(groups.groups).toEqual([{key: value, itemIds: expect.arrayContaining([first.id, second.id, local.id])}])
    expect(source.reads).toHaveBeenCalledTimes(4)
    expect(source.reads.mock.calls.every(call => call[0] === 'movie' && call[1]?.startsWith('bytes='))).toBe(true)
  })

  it('continues to fill fingerprints for local files without opening network connections', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-local-backfill-'))
    const filename = path.join(directory, 'movie.mp4')
    fs.writeFileSync(filename, Buffer.alloc(150000, 9))
    const row = createMediaRepository(db.drizzle).create({path: filename, mediaTypeId: 1, filesize: 150000})
    try {
      expect(await backfillMediaFingerprint(db, {...row, filesize: 150000, mediaType: 'video'})).toMatchObject({status: 'hashed'})
      expect(createMediaRepository(db.drizzle).findById(row.id)?.oshash).toBe(await computeOshash(filename))
      expect(source.open).not.toHaveBeenCalled()
    } finally { fs.rmSync(directory, {recursive: true, force: true}) }
  })

  it('does not redo fingerprints unless recalculation is requested', async () => {
    const row = add('nas')
    for await (const _event of iterateFingerprintBackfill(db)) { /* drain */ }
    source.reads.mockClear()
    for await (const _event of iterateFingerprintBackfill(db)) { /* drain */ }
    expect(source.reads).not.toHaveBeenCalled()
    for await (const _event of iterateFingerprintBackfill(db, {force: true})) { /* drain */ }
    expect(source.reads).toHaveBeenCalledTimes(2)
    expect(createMediaRepository(db.drizzle).findById(row.id)?.oshash).toBeTruthy()
  })

  it('keeps remote cards pending if ranges are unsupported', async () => {
    const row = add('gdrive')
    source.reads.mockResolvedValue({status: 200, headers: {'content-range': '', 'content-length': String(bigSize)}, body: Readable.from([])})
    expect(await backfillMediaFingerprint(db, row)).toMatchObject({status: 'failed'})
    expect(createMediaRepository(db.drizzle).findById(row.id)?.oshash).toBeNull()
    expect(await getFingerprintBackfillStatus(db)).toMatchObject({pending: 1})
  })

  it.each(['path', 'library', 'stop'])('does not write after a %s change during hashing', async kind => {
    const row = add('nas')
    let stopped = false
    source.reads.mockImplementationOnce(async () => {
      if (kind === 'path') createMediaRepository(db.drizzle).updateById(row.id, {path: `nas://${nas}/different.mp4`})
      else if (kind === 'library') db.path = '/other-library'
      else stopped = true
      return {status: 206, headers: {'content-range': `bytes 0-65535/${bigSize}`, 'content-length': String(CHUNK_SIZE)}, body: Readable.from([head])}
    })
    expect(await backfillMediaFingerprint(db, row, {shouldStop: () => stopped})).toMatchObject({status: 'failed'})
    expect(createMediaRepository(testDb.drizzle).findById(row.id)?.oshash).toBeNull()
  })
})
