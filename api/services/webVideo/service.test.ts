// @vitest-environment node
import {Readable, Writable} from 'stream'
import type {Request, Response} from 'express'
import {beforeEach, afterEach, describe, expect, it, vi} from 'vitest'
import axios from 'axios'
import {closeTestDb, createTestDb, type TestDb} from '../../db/testUtils/createTestDb'
import {createMediaTypesRepository} from '../../db/repositories/mediaTypes'
import {createMediaRepository} from '../../db/repositories/media'
import {createVideoMetadataRepository} from '../../db/repositories/videoMetadata'
import {extractXHamster} from './ytDlp'
import {importWebVideo, parseExtraction, prepareWebVideo, rewriteHlsManifest, selectStreamQuality, streamWebVideo, validateStreamUrl} from './service'

vi.mock('./ytDlp', () => ({extractXHamster: vi.fn()}))
vi.mock('../mediaCacheInvalidation', () => ({invalidateMediaDerivedCaches: vi.fn()}))
vi.mock('axios', () => ({default: {get: vi.fn()}}))

const page = 'https://xhamster.com/videos/test-xhAb12'
const fixture = {
  title: 'Test video', duration: 123,
  formats: [{url: 'https://video.xhcdn.com/video.mp4', ext: 'mp4', protocol: 'https',
    vcodec: 'h264', acodec: 'aac', height: 720, width: 1280}],
}

describe('web video extraction and HLS', () => {
  it('offers unique resolutions and selects a fixed variant or an adaptive HLS master', () => {
    const source = parseExtraction({...fixture, formats: [...fixture.formats,
      {...fixture.formats[0], url: 'https://video.xhcdn.com/low.m3u8', protocol: 'm3u8_native', height: 480,
        manifest_url: 'https://video.xhcdn.com/master.m3u8'},
      {...fixture.formats[0], url: 'https://video.xhcdn.com/high.m3u8', protocol: 'm3u8_native', height: 1080,
        manifest_url: 'https://video.xhcdn.com/master.m3u8'},
    ]}, page)
    expect(source.qualities).toEqual([1080, 720, 480])
    expect(selectStreamQuality(source)).toMatchObject({url: 'https://video.xhcdn.com/master.m3u8', adaptive: true, quality: null})
    expect(selectStreamQuality(source, 480)).toMatchObject({url: 'https://video.xhcdn.com/low.m3u8', adaptive: false, quality: 480})
    expect(selectStreamQuality(source, 720)).toMatchObject({url: fixture.formats[0].url, kind: 'mp4', quality: 720})
    expect(() => selectStreamQuality(source, 1440)).toThrow('quality is no longer available')
  })

  it('ignores an untrusted HLS master instead of proxying it', () => {
    const source = parseExtraction({...fixture, formats: [{...fixture.formats[0],
      protocol: 'm3u8_native', manifest_url: 'https://localhost/secret'}]}, page)
    expect(selectStreamQuality(source)).toMatchObject({url: fixture.formats[0].url, adaptive: false})
  })
  it('selects a combined H264 HLS stream and excludes separate audio/video and untrusted hosts', () => {
    const data = {...fixture, formats: [...fixture.formats,
      {...fixture.formats[0], height: 2160, acodec: 'none'},
      {...fixture.formats[0], url: 'https://evil.test/video.mp4', height: 2160},
      {...fixture.formats[0], url: 'https://video.xhcdn.com/master.m3u8', protocol: 'm3u8_native', height: 1080},
    ]}
    expect(parseExtraction(data, page)).toMatchObject({kind: 'hls', height: 1080, headers: {referer: page}})
  })

  it('rejects arbitrary upstream hosts and unsupported formats', () => {
    for (const url of ['https://localhost/a', 'http://video.xhcdn.com/a', 'https://xhcdn.com.evil.test/a',
      'https://user:pass@video.xhcdn.com/a', 'https://127.0.0.1/a', 'https://video.xhcdn.com:1234/a']) {
      expect(() => validateStreamUrl(url)).toThrow()
    }
    expect(() => parseExtraction({...fixture, formats: []}, page)).toThrow('No supported')
  })

  it('rewrites playlists, segments, initialization maps and AES keys', () => {
    const registered: string[] = []
    const output = rewriteHlsManifest('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:5,\nsegment.ts\n',
      'https://video.xhcdn.com/hls/index.m3u8', (url) => {registered.push(url); return `/proxy/${registered.length}`})
    expect(registered).toEqual(['https://video.xhcdn.com/hls/key.bin', 'https://video.xhcdn.com/hls/init.mp4', 'https://video.xhcdn.com/hls/segment.ts'])
    expect(output).toContain('URI="/proxy/1"')
    expect(output).toContain('\n/proxy/3\n')
    expect(() => rewriteHlsManifest('#EXTM3U\nhttp://127.0.0.1/secret', 'https://video.xhcdn.com/a', String)).toThrow()
  })
})

describe('web video library and playback proxy', () => {
  let db: TestDb
  beforeEach(() => {
    vi.clearAllMocks()
    db = createTestDb('web-video')
    createMediaTypesRepository(db.drizzle).create({type: 'video', name: 'Videos'})
    vi.mocked(extractXHamster).mockResolvedValue(fixture)
  })
  afterEach(() => closeTestDb(db))

  it('imports a stable page URL with metadata and skips repeat extraction on duplicates', async () => {
    const first = await importWebVideo(db, page)
    const second = await importWebVideo(db, 'https://ru.xhamster.com/videos/another-title-xhAb12?utm_source=test')
    expect(first.created).toBe(true)
    expect(second).toMatchObject({id: first.id, created: false})
    expect(extractXHamster).toHaveBeenCalledTimes(1)
    expect(createMediaRepository(db.drizzle).findById(first.id)?.path).toBe('https://xhamster.com/videos/video-xhAb12')
    expect(createVideoMetadataRepository(db.drizzle).findByMediaId(first.id)?.duration).toBe(123)
  })

  it('keeps failed extraction out of the library', async () => {
    vi.mocked(extractXHamster).mockRejectedValue(new Error('Unavailable'))
    await expect(importWebVideo(db, page)).rejects.toThrow('Unavailable')
    expect(createMediaRepository(db.drizzle).countAll()).toBe(0)
  })

  it('refreshes quality options on request and returns only a session URL to the player', async () => {
    const item = await importWebVideo(db, page)
    vi.mocked(extractXHamster).mockResolvedValue({...fixture, formats: [fixture.formats[0],
      {...fixture.formats[0], height: 480, url: 'https://video.xhcdn.com/low.mp4?signature=secret'},
    ]})
    const playable = await prepareWebVideo(db, item.id, {quality: 480, fresh: true})
    expect(playable).toMatchObject({qualities: [720, 480], quality: 480, adaptive: false})
    expect(JSON.stringify(playable)).not.toContain('signature')
    expect(extractXHamster).toHaveBeenCalledTimes(2)
    await expect(prepareWebVideo(db, item.id, {quality: 2160})).rejects.toThrow('quality')
  })

  it('cancels extraction when the player disconnects and lets a new request recover', async () => {
    const item = await importWebVideo(db, page)
    let extractionSignal!: AbortSignal
    vi.mocked(extractXHamster).mockImplementationOnce((_db, _url, signal) => new Promise((_resolve, reject) => {
      extractionSignal = signal!
      signal!.addEventListener('abort', () => reject(signal!.reason), {once: true})
    }))
    const controller = new AbortController()
    const pending = prepareWebVideo(db, item.id, {fresh: true, signal: controller.signal})
    const rejection = expect(pending).rejects.toMatchObject({name: 'AbortError'})
    controller.abort()
    await rejection
    expect(extractionSignal.aborted).toBe(true)
    expect((await prepareWebVideo(db, item.id)).url).toContain('/stream?session=')
  })

  it('keeps a shared extraction alive for another player when one request is cancelled', async () => {
    const item = await importWebVideo(db, page)
    let finish!: (source: unknown) => void
    let extractionSignal!: AbortSignal
    vi.mocked(extractXHamster).mockImplementationOnce((_db, _url, signal) => new Promise(resolve => {
      extractionSignal = signal!
      finish = resolve
    }))
    const controller = new AbortController()
    const cancelled = prepareWebVideo(db, item.id, {fresh: true, signal: controller.signal})
    const remaining = prepareWebVideo(db, item.id)
    const rejection = expect(cancelled).rejects.toMatchObject({name: 'AbortError'})
    controller.abort()
    await rejection
    expect(extractionSignal.aborted).toBe(false)
    finish(fixture)
    expect((await remaining).url).toContain('/stream?session=')
    expect(extractXHamster).toHaveBeenCalledTimes(2)
  })

  it('forwards Range and Referer and streams 206 without buffering the video', async () => {
    const item = await importWebVideo(db, page)
    const playable = await prepareWebVideo(db, item.id)
    const chunks: Buffer[] = []
    const res = new Writable({write(chunk, _encoding, done) {chunks.push(Buffer.from(chunk)); done()}}) as unknown as Response
    res.status = vi.fn(() => res)
    res.setHeader = vi.fn(() => res)
    vi.mocked(axios.get).mockResolvedValue({status: 206, headers: {'content-range': 'bytes 0-3/20', 'content-length': '4'}, data: Readable.from([Buffer.from('test')])})
    const req = {query: Object.fromEntries(new URL(playable.url, 'http://localhost').searchParams), headers: {range: 'bytes=0-3'}} as unknown as Request
    await streamWebVideo(db, req, res, item.id)
    expect(Buffer.concat(chunks).toString()).toBe('test')
    expect(res.status).toHaveBeenCalledWith(206)
    expect(axios.get).toHaveBeenCalledWith(fixture.formats[0].url, expect.objectContaining({headers: expect.objectContaining({Range: 'bytes=0-3', referer: 'https://xhamster.com/videos/video-xhAb12'})}))
    expect(res.setHeader).toHaveBeenCalledWith('content-range', 'bytes 0-3/20')
  })

  it('does not accept an arbitrary URL instead of a registered resource', async () => {
    const item = await importWebVideo(db, page)
    const playable = await prepareWebVideo(db, item.id)
    const query = Object.fromEntries(new URL(playable.url, 'http://localhost').searchParams)
    const res = {status: vi.fn().mockReturnThis(), end: vi.fn()} as unknown as Response
    await streamWebVideo(db, {query: {...query, resource: 'https://localhost/secret'}} as unknown as Request, res, item.id)
    expect(res.status).toHaveBeenCalledWith(404)
    expect(axios.get).not.toHaveBeenCalled()
  })

  it('refreshes an expired root URL once without storing it in the library', async () => {
    const item = await importWebVideo(db, page)
    const playable = await prepareWebVideo(db, item.id)
    vi.mocked(extractXHamster).mockResolvedValue({...fixture, formats: [
      {...fixture.formats[0], url: 'https://video.xhcdn.com/refreshed.mp4'},
    ]})
    vi.mocked(axios.get)
      .mockResolvedValueOnce({status: 403, headers: {}, data: Readable.from([])})
      .mockResolvedValueOnce({status: 200, headers: {}, data: Readable.from([Buffer.from('test')])})
    const res = new Writable({write(_chunk, _encoding, done) {done()}}) as unknown as Response
    res.status = vi.fn(() => res)
    res.setHeader = vi.fn(() => res)
    await streamWebVideo(db, {
      query: Object.fromEntries(new URL(playable.url, 'http://localhost').searchParams), headers: {},
    } as unknown as Request, res, item.id)
    expect(axios.get).toHaveBeenLastCalledWith('https://video.xhcdn.com/refreshed.mp4', expect.any(Object))
    expect(extractXHamster).toHaveBeenCalledTimes(2)
    expect(createMediaRepository(db.drizzle).findById(item.id)?.path).toContain('xhamster.com/videos/')
  })

  it('keeps a fixed quality when an expired root stream is resolved again', async () => {
    vi.mocked(extractXHamster).mockResolvedValue({...fixture, formats: [fixture.formats[0],
      {...fixture.formats[0], height: 480, url: 'https://video.xhcdn.com/low.mp4'},
    ]})
    const item = await importWebVideo(db, page)
    const playable = await prepareWebVideo(db, item.id, {quality: 480})
    vi.mocked(extractXHamster).mockResolvedValue({...fixture, formats: [fixture.formats[0],
      {...fixture.formats[0], height: 480, url: 'https://video.xhcdn.com/low-new.mp4'},
    ]})
    vi.mocked(axios.get)
      .mockResolvedValueOnce({status: 403, headers: {}, data: Readable.from([])})
      .mockResolvedValueOnce({status: 200, headers: {}, data: Readable.from([Buffer.from('test')])})
    const res = new Writable({write(_chunk, _encoding, done) {done()}}) as unknown as Response
    res.status = vi.fn(() => res)
    res.setHeader = vi.fn(() => res)
    await streamWebVideo(db, {query: Object.fromEntries(new URL(playable.url, 'http://localhost').searchParams),
      headers: {}} as unknown as Request, res, item.id)
    expect(axios.get).toHaveBeenLastCalledWith('https://video.xhcdn.com/low-new.mp4', expect.any(Object))
  })

  it('rejects a session from a different database', async () => {
    const item = await importWebVideo(db, page)
    const playable = await prepareWebVideo(db, item.id)
    const other = createTestDb('web-video-other')
    try {
      const res = {status: vi.fn().mockReturnThis(), json: vi.fn()} as unknown as Response
      await streamWebVideo(other, {
        query: Object.fromEntries(new URL(playable.url, 'http://localhost').searchParams), headers: {},
      } as unknown as Request, res, item.id)
      expect(res.status).toHaveBeenCalledWith(410)
      expect(axios.get).not.toHaveBeenCalled()
    } finally {closeTestDb(other)}
  })

  it('does not follow an upstream redirect to an untrusted host', async () => {
    const item = await importWebVideo(db, page)
    const playable = await prepareWebVideo(db, item.id)
    vi.mocked(axios.get).mockResolvedValue({status: 302, headers: {location: 'http://127.0.0.1/secret'}, data: Readable.from([])})
    const res = new Writable() as unknown as Response
    await expect(streamWebVideo(db, {
      query: Object.fromEntries(new URL(playable.url, 'http://localhost').searchParams), headers: {},
    } as unknown as Request, res, item.id)).rejects.toThrow('Unsupported xHamster stream host')
    expect(axios.get).toHaveBeenCalledTimes(1)
  })
})
