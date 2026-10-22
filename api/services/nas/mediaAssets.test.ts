// @vitest-environment node
import fs from 'fs'
import os from 'os'
import path from 'path'
import {createHash} from 'crypto'
import {execFileSync} from 'child_process'
import sharp from 'sharp'
import {beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi} from 'vitest'
import {createTestDb, closeTestDb, type TestDb} from '../../db/testUtils/createTestDb'
import {createMediaRepository} from '../../db/repositories/media'
import {createMediaTypesRepository} from '../../db/repositories/mediaTypes'
import {createVideoMetadataRepository} from '../../db/repositories/videoMetadata'
import {createImageMetadataRepository} from '../../db/repositories/imageMetadata'
import {sourceConnections, mediaLocations} from '../../db/schema'
import type {ApiDb} from '../../types/db'
import {nasMediaPath} from '../../../shared/remoteMedia'
import {READ_SOURCE_CAPABILITIES} from '../../../shared/mediaSources'
import {nasFileVersion, type SourceReadAdapter} from '../mediaSources/adapter'
import {parseSourceRange} from '../mediaSources/range'
import {getFfmpegPath} from '../../utils/ffmpegPaths'
import {createNasMediaAssetsService} from './mediaAssets'
import {nasThumbnailPath, nasThumbnailSnapshot, readNasAssetsState} from './mediaAssetsState'

vi.mock('../mediaCacheInvalidation', () => ({invalidateMediaDerivedCaches: vi.fn()}))
const connectionId = '11111111-1111-4111-8111-111111111111'
let base: string, fixture: TestDb, db: ApiDb, directory: string, mediaId: number, source: string, key: string, version: string, time: number
let reads: Array<{start: number; end: number}>, bytesRead: number, closes: number
const services: ReturnType<typeof createNasMediaAssetsService>[] = []
beforeAll(async () => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-nas-assets-fixtures-'))
  execFileSync(getFfmpegPath(), ['-nostdin', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:d=2:r=12', '-c:v', 'libx264', '-threads', '1', path.join(base, 'movie.mp4')])
  execFileSync(getFfmpegPath(), ['-nostdin', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=duration=2', '-c:a', 'pcm_s16le', path.join(base, 'song.wav')])
  await sharp({create: {width: 900, height: 600, channels: 3, background: '#3f687a'}}).jpeg().toFile(path.join(base, 'photo.jpg'))
  execFileSync(getFfmpegPath(), ['-nostdin', '-hide_banner', '-loglevel', 'error', '-i', path.join(base, 'song.wav'), '-i', path.join(base, 'photo.jpg'), '-map', '0:a', '-map', '1:v', '-c:a', 'libmp3lame', '-c:v', 'copy', '-id3v2_version', '3', path.join(base, 'cover.mp3')])
})
afterAll(() => fs.rmSync(base, {recursive: true, force: true}))
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-nas-assets-'))
  fixture = createTestDb('nas-assets'); db = {...fixture, path: directory}; time = 1000
  reads = []; bytesRead = 0; closes = 0
  for (const kind of ['video', 'audio', 'image']) createMediaTypesRepository(db.drizzle).create({name: kind, type: kind})
  db.drizzle.insert(sourceConnections).values({id: connectionId, provider: 'nas', config: '{}', credentialRef: 'secret', createdAt: '2026'}).run()
  add('video', 'movie.mp4')
})
afterEach(() => { services.splice(0).forEach(service => service.dispose()); closeTestDb(fixture); fs.rmSync(directory, {recursive: true, force: true}) })
function add(kind: string, filename: string, file = path.join(base, filename), hashedVersion = false) {
  source = file; key = filename
  const size = fs.statSync(source).size
  version = nasFileVersion({size, modifiedAt: 1000})
  const stored = hashedVersion ? `sha256:${createHash('sha256').update(version).digest('hex')}` : version
  const row = createMediaRepository(db.drizzle).create({path: nasMediaPath(connectionId, filename), filesize: size,
    mediaTypeId: createMediaTypesRepository(db.drizzle).findByType(kind)!.id})
  mediaId = row.id
  db.drizzle.insert(mediaLocations).values({id: `location-${row.id}`, mediaId: row.id, connectionId, resourceKey: filename, version: stored}).run()
  return row.id
}
const open = vi.fn<typeof import('../mediaSources/context').openSource>(async () => {
  let closed = false
  const assertOpen = () => { if (closed) throw new Error('This NAS session is already closed') }
  const adapter: SourceReadAdapter = {provider: 'nas', capabilities: READ_SOURCE_CAPABILITIES, list: vi.fn(),
    stat: vi.fn(async resourceKey => {
      assertOpen()
      const contentType = key.endsWith('.jpg') ? 'image/jpeg' : key.endsWith('.wav') ? 'audio/wav' : key.endsWith('.mp3') ? 'audio/mpeg' : 'video/mp4'
      return {resourceKey, name: key, size: fs.statSync(source).size, version, isDirectory: false, contentType}
    }),
    read: vi.fn(async (_resourceKey, header) => {
      assertOpen(); expect(header).toBeDefined()
      const range = parseSourceRange(header, fs.statSync(source).size)!
      reads.push({start: range.start, end: range.end})
      const body = fs.createReadStream(source, {start: range.start, end: range.end})
      body.on('data', chunk => { bytesRead += chunk.length })
      // FTP sessions cannot be reused once a range transfer finishes.
      body.once('close', () => { closed = true })
      return {status: 206, headers: {'content-range': `bytes ${range.start}-${range.end}/${fs.statSync(source).size}`}, body}
    }), close() { if (!closed) closes++; closed = true },
  }
  return adapter
})
function service(options: Omit<Parameters<typeof createNasMediaAssetsService>[1], 'open'> = {}) {
  const worker = createNasMediaAssetsService(db, {open, now: () => time, ...options})
  services.push(worker); return worker
}
const meta = () => createVideoMetadataRepository(db.drizzle).findByMediaId(mediaId)
const thumb = (kind = 'video') => nasThumbnailPath(db.path!, kind, mediaId)

describe('NAS metadata and thumbnails over bounded range reads', () => {
  it('probes a real video, caches a JPEG, deduplicates requests and reuses the cache', async () => {
    const worker = service()
    expect(await Promise.all([worker.ensure(mediaId), worker.ensure(mediaId)])).toEqual([true, true])
    expect(meta()).toMatchObject({duration: 2, width: 320, height: 180, codec: 'h264', fps: 12})
    expect(await sharp(thumb()).metadata()).toMatchObject({format: 'jpeg', width: 320, height: 180})
    expect(nasThumbnailSnapshot(db, mediaId)).toMatchObject({thumbnailState: 'ready', thumbnailVersion: expect.any(Number)})
    const count = reads.length
    expect(await worker.ensure(mediaId)).toBe(false); expect(reads).toHaveLength(count)
    expect(closes).toBeGreaterThan(0)
    expect(fs.readdirSync(path.dirname(thumb())).filter(name => name.includes('.tmp'))).toEqual([])
  })
  it('seeks to an index at the end without downloading a large padding region', async () => {
    const original = fs.readFileSync(source)
    let offset = 0
    while (offset < original.length && original.toString('ascii', offset + 4, offset + 8) !== 'moov') offset += original.readUInt32BE(offset)
    expect(offset).toBeLessThan(original.length)
    const padding = Buffer.alloc(40 * 1024 * 1024)
    padding.writeUInt32BE(padding.length); padding.write('free', 4)
    const large = path.join(directory, 'large.mp4')
    fs.writeFileSync(large, Buffer.concat([original.subarray(0, offset), padding, original.subarray(offset)]))
    add('video', 'large.mp4', large, true)
    expect(await service().ensure(mediaId)).toBe(true)
    expect(meta()?.duration).toBe(2)
    expect(reads.some(range => range.start > padding.length)).toBe(true)
    expect(bytesRead).toBeLessThan(8 * 1024 * 1024)
    expect(fs.existsSync(thumb())).toBe(true)
  })
  it('caches image dimensions and a small thumbnail', async () => {
    add('image', 'photo.jpg')
    await service().ensure(mediaId)
    expect(createImageMetadataRepository(db.drizzle).findByMediaId(mediaId)).toMatchObject({width: 900, height: 600})
    const info = await sharp(thumb('image')).metadata()
    expect(info.width).toBe(640); expect(info.height).toBeLessThanOrEqual(640)
  })
  it('reads audio metadata and records that a file has no embedded cover', async () => {
    add('audio', 'song.wav')
    const worker = service()
    await worker.ensure(mediaId)
    expect(meta()).toMatchObject({duration: 2, codec: 'pcm_s16le'})
    expect(nasThumbnailSnapshot(db, mediaId)).toEqual({thumbnailState: 'unavailable'})
    const count = reads.length
    await worker.ensure(mediaId); expect(reads).toHaveLength(count)
  })
  it('extracts an embedded audio cover', async () => {
    add('audio', 'cover.mp3')
    await service().ensure(mediaId)
    expect(meta()?.codec).toBe('mp3')
    expect(await sharp(thumb('audio')).metadata()).toMatchObject({format: 'jpeg', width: 640})
    expect(nasThumbnailSnapshot(db, mediaId).thumbnailState).toBe('ready')
  })
  it('restores a lost thumbnail while keeping cached metadata', async () => {
    const worker = service()
    await worker.ensure(mediaId)
    fs.unlinkSync(thumb())
    const count = reads.length
    await worker.ensure(mediaId)
    expect(reads.length).toBeGreaterThan(count)
    expect(fs.existsSync(thumb())).toBe(true)
  })
  it('fills a missing filesize even when technical metadata and a thumbnail already exist', async () => {
    createMediaRepository(db.drizzle).updateById(mediaId, {filesize: 0})
    createVideoMetadataRepository(db.drizzle).create({mediaId, duration: 2, width: 320, height: 180, fps: 12, bitrate: 1000, codec: 'h264'})
    fs.mkdirSync(path.dirname(thumb()), {recursive: true})
    const custom = fs.readFileSync(path.join(base, 'photo.jpg'))
    fs.writeFileSync(thumb(), custom)
    await service().ensure(mediaId)
    expect(createMediaRepository(db.drizzle).findById(mediaId)?.filesize).toBe(fs.statSync(source).size)
    expect(fs.readFileSync(thumb())).toEqual(custom)
  })
  it('processes newly imported files on the next background tick without waiting for the retry interval', async () => {
    const worker = service()
    await worker.tick()
    expect(meta()?.duration).toBe(2)
    add('audio', 'song.wav')
    await worker.tick()
    expect(meta()).toMatchObject({duration: 2, codec: 'pcm_s16le'})
  })

  it('keeps known metadata and a poster saved while the NAS frame was loading', async () => {
    createVideoMetadataRepository(db.drizzle).create({mediaId, duration: 100, width: 0, height: 0, time: 13})
    const custom = await sharp({create: {width: 200, height: 100, channels: 3, background: '#faa'}}).jpeg().toBuffer()
    const worker = service({thumbnail: async (_url: string, output: string) => {
      fs.writeFileSync(thumb(), custom)
      await sharp({create: {width: 320, height: 180, channels: 3, background: '#00f'}}).jpeg().toFile(output)
    }})
    await worker.ensure(mediaId)
    expect(meta()).toMatchObject({duration: 100, width: 320, height: 180, time: 13})
    expect(fs.readFileSync(thumb())).toEqual(custom)
  })
  it('keeps metadata when thumbnail extraction fails and retries the cover later', async () => {
    const thumbnail = vi.fn(async () => { throw new Error('decode failed') })
    const worker = service({thumbnail})
    await worker.ensure(mediaId)
    expect(meta()?.duration).toBe(2)
    expect(readNasAssetsState(db.path!, mediaId, createMediaRepository(db.drizzle).findById(mediaId)!.path)?.thumbnail).toBe('pending')
    await worker.ensure(mediaId); expect(thumbnail).toHaveBeenCalledTimes(1)
    time += 15 * 60_000; await worker.ensure(mediaId); expect(thumbnail).toHaveBeenCalledTimes(2)
  })
  it('enforces a read budget and backs off a failed probe', async () => {
    const worker = service({maxProbeBytes: 1})
    await expect(worker.ensure(mediaId)).rejects.toThrow()
    expect(meta()).toBeUndefined(); expect(fs.existsSync(thumb())).toBe(false)
    const count = reads.length
    await worker.ensure(mediaId); expect(reads).toHaveLength(count)
  })
  it.each(['library', 'source', 'version', 'connection', 'trash'] as const)('does not write after a %s change during probing', async change => {
    const destination = thumb()
    const worker = service({probe: async () => {
      if (change === 'library') db.path = 'other-library'
      if (change === 'source') createMediaRepository(db.drizzle).updateById(mediaId, {path: '/changed.mp4'})
      if (change === 'version') version = 'changed'
      if (change === 'connection') db.sqlite.prepare("UPDATE sourceConnections SET config = 'changed'").run()
      if (change === 'trash') createMediaRepository(db.drizzle).updateById(mediaId, {deletedAt: '2026'})
      return {metadata: {duration: 2, width: 320, height: 180}, coverIndex: undefined}
    }})
    await expect(worker.ensure(mediaId)).rejects.toThrow()
    expect(meta()).toBeUndefined(); expect(fs.existsSync(destination)).toBe(false)
  })
  it('cancels processing on disposal', async () => {
    const probe = vi.fn((_url: string, signal: AbortSignal) => new Promise<Awaited<ReturnType<typeof import('./mediaProbe').probeNasMedia>>>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), {once: true})
    }))
    const worker = service({probe})
    const pending = worker.ensure(mediaId)
    const rejected = expect(pending).rejects.toThrow()
    await vi.waitFor(() => expect(probe).toHaveBeenCalled())
    worker.dispose(); await rejected
  })
})
