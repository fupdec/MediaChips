// @vitest-environment node
import fs from 'fs'
import path from 'path'
import os from 'os'
import sharp from 'sharp'
import {beforeEach, afterEach, it, expect, vi} from 'vitest'
import {createTestDb, closeTestDb, type TestDb} from '../db/testUtils/createTestDb'
import {createMediaRepository} from '../db/repositories/media'
import {createMediaTypesRepository} from '../db/repositories/mediaTypes'
import type {ApiDb} from '../types/db'
import {resolveWebVideoThumbnail} from './webVideo/service'
import {ensureVideoPreviewThumb} from './videoPreviewThumb'
import {ensureRemoteVideoThumbnail} from './remoteVideoThumbnail'
import {getNasMediaAssets} from './nas/mediaAssets'

vi.mock('./nas/mediaAssets', () => ({getNasMediaAssets: vi.fn()}))
vi.mock('./webVideo/service', () => ({resolveWebVideoThumbnail: vi.fn()}))
vi.mock('../utils/ffmpeg', () => ({extractVideoThumbnail: vi.fn(() => {throw new Error('Must not process a remote original')})}))

let fixture: TestDb, db: ApiDb, id: number, bytes: Buffer, directory: string
beforeEach(async () => {
  fixture = createTestDb('remote-thumbnail')
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-remote-cover-'))
  db = {...fixture, path: directory}
  const type = createMediaTypesRepository(db.drizzle).create({name: 'Video', type: 'video'})
  id = createMediaRepository(db.drizzle).create({path: 'https://example.com/watch/123', mediaTypeId: type.id}).id
  bytes = await sharp({create: {width: 1280, height: 720, channels: 3, background: '#274569'}}).png().toBuffer()
  vi.mocked(resolveWebVideoThumbnail).mockReset().mockResolvedValue(bytes)
})
afterEach(() => { closeTestDb(fixture); fs.rmSync(directory, {recursive: true, force: true}) })
const output = () => path.join(db.path!, 'media/videos/thumbs', `${id}.jpg`)

it('returns immediately while a NAS cover is still being generated', async () => {
  createMediaRepository(db.drizzle).updateById(id, {path: 'nas://11111111-1111-4111-8111-111111111111/video.mp4'})
  let finish!: (changed: boolean) => void
  const processing = new Promise<boolean>(resolve => { finish = resolve })
  const ensure = vi.fn(() => processing)
  vi.mocked(getNasMediaAssets).mockReturnValue({ensure, tick: vi.fn(), dispose: vi.fn()})
  try {
    expect(await ensureVideoPreviewThumb(id, db, vi.fn(() => null))).toBeNull()
    expect(ensure).toHaveBeenCalledWith(id)
  } finally { finish(false); await processing }
})

it('serves a cached NAS cover without scheduling remote processing', async () => {
  createMediaRepository(db.drizzle).updateById(id, {path: 'nas://11111111-1111-4111-8111-111111111111/video.mp4'})
  const ensure = vi.fn()
  vi.mocked(getNasMediaAssets).mockReturnValue({ensure, tick: vi.fn(), dispose: vi.fn()})
  fs.mkdirSync(path.dirname(output()), {recursive: true})
  fs.writeFileSync(output(), await sharp(bytes).jpeg().toBuffer())
  expect(await ensureRemoteVideoThumbnail(db, id)).toBe(output())
  expect(ensure).not.toHaveBeenCalled()
})

it('downloads a remote cover once, resizes it and serves the local cache on later requests', async () => {
  const resolveLocal = vi.fn(() => null)
  const [first, second] = await Promise.all([
    ensureVideoPreviewThumb(id, db, resolveLocal), ensureVideoPreviewThumb(id, db, resolveLocal),
  ])
  expect(first).toBe(output()); expect(second).toBe(first)
  expect(await sharp(output()).metadata()).toMatchObject({format: 'jpeg', width: 640, height: 360})
  expect(await ensureVideoPreviewThumb(id, db, resolveLocal)).toBe(first)
  expect(resolveWebVideoThumbnail).toHaveBeenCalledTimes(1)
  expect(resolveLocal).not.toHaveBeenCalled()
})

it('backs off when the provider has no cover', async () => {
  vi.mocked(resolveWebVideoThumbnail).mockResolvedValue(null)
  expect(await ensureRemoteVideoThumbnail(db, id)).toBeNull()
  expect(await ensureRemoteVideoThumbnail(db, id)).toBeNull()
  expect(resolveWebVideoThumbnail).toHaveBeenCalledTimes(1)
  expect(fs.existsSync(output())).toBe(false)
})

it('preserves a poster saved while the remote cover was loading', async () => {
  vi.mocked(resolveWebVideoThumbnail).mockImplementation(async () => {
    fs.mkdirSync(path.dirname(output()), {recursive: true})
    fs.writeFileSync(output(), 'custom poster')
    return bytes
  })
  await ensureRemoteVideoThumbnail(db, id)
  expect(fs.readFileSync(output(), 'utf8')).toBe('custom poster')
})

it('does not write into a switched library', async () => {
  const previous = output()
  vi.mocked(resolveWebVideoThumbnail).mockImplementation(async () => {
    db.path = `${fixture.dbPath}-other`
    return bytes
  })
  expect(await ensureRemoteVideoThumbnail(db, id)).toBeNull()
  expect(fs.existsSync(previous)).toBe(false)
})

it('rejects a cover when the media source changed during the request', async () => {
  vi.mocked(resolveWebVideoThumbnail).mockImplementation(async () => {
    createMediaRepository(db.drizzle).updateById(id, {path: 'https://example.com/watch/other'})
    return bytes
  })
  expect(await ensureRemoteVideoThumbnail(db, id)).toBeNull()
  expect(fs.existsSync(output())).toBe(false)
})
