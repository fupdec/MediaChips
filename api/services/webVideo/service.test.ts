// @vitest-environment node
import {Readable, Writable} from 'stream'
import type {Request, Response} from 'express'
import {beforeEach, afterEach, describe, expect, it, vi} from 'vitest'
import axios from 'axios'
import {closeTestDb, createTestDb, type TestDb} from '../../db/testUtils/createTestDb'
import {createMediaTypesRepository} from '../../db/repositories/mediaTypes'
import {createMediaRepository} from '../../db/repositories/media'
import {createVideoMetadataRepository} from '../../db/repositories/videoMetadata'
import {extractWebVideo} from './ytDlp'
import {importWebVideo, parseExtraction, prepareWebVideo, rewriteHlsManifest, selectStreamQuality, streamWebVideo, validateStreamUrl} from './service'

vi.mock('./ytDlp', () => ({extractWebVideo: vi.fn()}))
vi.mock('../mediaCacheInvalidation', () => ({invalidateMediaDerivedCaches: vi.fn()}))
vi.mock('axios', () => ({default: {get: vi.fn()}}))

const page = 'https://xhamster.com/videos/test-xhAb12'
const fixture = {
  title: 'Test video', duration: 123,
  formats: [{url: 'https://video.xhcdn.com/video.mp4', ext: 'mp4', protocol: 'https',
    vcodec: 'h264', acodec: 'aac', height: 720, width: 1280}],
}

describe('web video extraction and HLS', () => {
  it('keeps the remote cover and ignores unsafe image URLs', () => {
    expect(parseExtraction({...fixture, thumbnail: 'https://images.example.com/poster.webp'}, page).thumbnail)
      .toBe('https://images.example.com/poster.webp')
    expect(parseExtraction({...fixture, thumbnail: 'https://localhost/private',
      thumbnails: [{url: 'https://images.example.com/fallback.jpg'}]}, page).thumbnail)
      .toBe('https://images.example.com/fallback.jpg')
    expect(parseExtraction({...fixture, thumbnail: 'https://127.0.0.1/private'}, page).thumbnail).toBeNull()
  })

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
  it('selects a combined H264 HLS stream and excludes separate audio/video and private hosts', () => {
    const data = {...fixture, formats: [...fixture.formats,
      {...fixture.formats[0], height: 2160, acodec: 'none'},
      {...fixture.formats[0], url: 'https://localhost/video.mp4', height: 2160},
      {...fixture.formats[0], url: 'https://video.xhcdn.com/master.m3u8', protocol: 'm3u8_native', height: 1080},
    ]}
    expect(parseExtraction(data, page)).toMatchObject({kind: 'hls', height: 1080, headers: {referer: page}})
  })

  it('rejects private upstream hosts and unsupported formats', () => {
    for (const url of ['https://localhost/a', 'http://video.xhcdn.com/a', 'https://private.internal/a',
      'https://user:pass@video.xhcdn.com/a', 'https://127.0.0.1/a', 'https://video.xhcdn.com:1234/a']) {
      expect(() => validateStreamUrl(url)).toThrow()
    }
    expect(() => parseExtraction({...fixture, formats: []}, page)).toThrow('No supported')
  })

  it('preserves extractor Referer for embeds and accepts external HLS CDNs', () => {
    const source = parseExtraction({...fixture, http_headers: {Referer: 'https://player.example.com/embed/123', Cookie: 'secret'},
      formats: [{...fixture.formats[0], protocol: 'm3u8_native', url: 'https://cdn.example.com/high.m3u8',
        manifest_url: 'https://cdn.example.com/master.m3u8', http_headers: {'User-Agent': 'Test', Authorization: 'secret'}}],
    }, 'https://example.com/watch/123')
    expect(source.headers).toEqual({referer: 'https://player.example.com/embed/123', 'user-agent': 'Test'})
    expect(selectStreamQuality(source).adaptive).toBe(true)
    const resources: string[] = []
    rewriteHlsManifest('#EXTM3U\nhttps://other-cdn.example.com/segment.ts', source.url, url => {resources.push(url); return '/proxy'})
    expect(resources).toEqual(['https://other-cdn.example.com/segment.ts'])
  })

  it('rejects collections, DRM and formats requiring a separate media pipeline', () => {
    expect(() => parseExtraction({...fixture, _type: 'playlist'}, page)).toThrow('single video')
    for (const format of [
      {...fixture.formats[0], has_drm: true},
      {...fixture.formats[0], protocol: 'http_dash_segments'},
      {...fixture.formats[0], acodec: 'none'},
    ]) expect(() => parseExtraction({...fixture, formats: [format]}, page)).toThrow('No supported')
  })

  it('unwraps a single embedded video from the generic HTML extractor', () => {
    expect(parseExtraction({_type: 'playlist', extractor: 'generic', entries: [fixture]}, page))
      .toMatchObject({title: fixture.title, kind: 'mp4', height: 720})
    for (const result of [
      {_type: 'playlist', extractor: 'generic', entries: [fixture, fixture]},
      {_type: 'playlist', extractor: 'generic', entries: []},
      {_type: 'playlist', extractor: 'SomeChannel', entries: [fixture]},
    ]) expect(() => parseExtraction(result, page)).toThrow('single video')
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
    vi.mocked(extractWebVideo).mockResolvedValue(fixture)
  })
  afterEach(() => closeTestDb(db))

  it('imports a stable page URL with metadata and skips repeat extraction on duplicates', async () => {
    const first = await importWebVideo(db, page)
    const second = await importWebVideo(db, 'https://ru.xhamster.com/videos/another-title-xhAb12?utm_source=test')
    expect(first.created).toBe(true)
    expect(second).toMatchObject({id: first.id, created: false})
    expect(extractWebVideo).toHaveBeenCalledTimes(1)
    expect(createMediaRepository(db.drizzle).findById(first.id)?.path).toBe('https://xhamster.com/videos/video-xhAb12')
    expect(createVideoMetadataRepository(db.drizzle).findByMediaId(first.id)?.duration).toBe(123)
  })

  it('imports, deduplicates and plays pages from other sites and CDNs', async () => {
    const page = 'https://www.pornhub.com/view_video.php?viewkey=ph123'
    vi.mocked(extractWebVideo).mockResolvedValue({...fixture, formats: [
      {...fixture.formats[0], url: 'https://media.example.com/video.mp4'},
    ]})
    const item = await importWebVideo(db, `${page}&utm_source=share#player`)
    expect(await importWebVideo(db, page)).toMatchObject({id: item.id, created: false})
    expect(createMediaRepository(db.drizzle).findById(item.id)?.path).toBe(page)
    expect(await prepareWebVideo(db, item.id)).toMatchObject({kind: 'mp4', qualities: [720]})
    expect(extractWebVideo).toHaveBeenCalledTimes(1)
    expect(extractWebVideo).toHaveBeenCalledWith(db, page, expect.any(AbortSignal))
  })

  it('keeps failed extraction out of the library', async () => {
    vi.mocked(extractWebVideo).mockRejectedValue(new Error('Unavailable'))
    await expect(importWebVideo(db, page)).rejects.toThrow('Unavailable')
    expect(createMediaRepository(db.drizzle).countAll()).toBe(0)
  })

  it('refreshes quality options on request and returns only a session URL to the player', async () => {
    const item = await importWebVideo(db, page)
    vi.mocked(extractWebVideo).mockResolvedValue({...fixture, formats: [fixture.formats[0],
      {...fixture.formats[0], height: 480, url: 'https://video.xhcdn.com/low.mp4?signature=secret'},
    ]})
    const playable = await prepareWebVideo(db, item.id, {quality: 480, fresh: true})
    expect(playable).toMatchObject({qualities: [720, 480], quality: 480, adaptive: false})
    expect(JSON.stringify(playable)).not.toContain('signature')
    expect(extractWebVideo).toHaveBeenCalledTimes(2)
    await expect(prepareWebVideo(db, item.id, {quality: 2160})).rejects.toThrow('quality')
  })

  it('cancels extraction when the player disconnects and lets a new request recover', async () => {
    const item = await importWebVideo(db, page)
    let extractionSignal!: AbortSignal
    vi.mocked(extractWebVideo).mockImplementationOnce((_db, _url, signal) => new Promise((_resolve, reject) => {
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
    vi.mocked(extractWebVideo).mockImplementationOnce((_db, _url, signal) => new Promise(resolve => {
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
    expect(extractWebVideo).toHaveBeenCalledTimes(2)
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

  it('uses a working same-resolution MP4 mirror after an initial 404 and pins later seek ranges to it', async () => {
    const mirror = 'https://cdn.example.com/mirror.mp4'
    vi.mocked(extractWebVideo).mockResolvedValue({...fixture, formats: [fixture.formats[0],
      {...fixture.formats[0], url: 'https://cdn.example.com/low.mp4', height: 480},
      {...fixture.formats[0], url: mirror, http_headers: {Referer: 'https://player.example.com/'}},
    ]})
    const item = await importWebVideo(db, page)
    const playable = await prepareWebVideo(db, item.id, {quality: 720})
    const stale = Readable.from([])
    vi.mocked(axios.get)
      .mockResolvedValueOnce({status: 404, headers: {}, data: stale})
      .mockResolvedValueOnce({status: 206, headers: {}, data: Readable.from(['first'])})
      .mockResolvedValueOnce({status: 206, headers: {}, data: Readable.from(['seek'])})
      .mockResolvedValueOnce({status: 404, headers: {}, data: Readable.from([])})
    const stream = async (range: string) => {
      const chunks: Buffer[] = []
      const res = new Writable({write(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); done() }}) as unknown as Response
      res.status = vi.fn(() => res)
      res.setHeader = vi.fn(() => res)
      res.json = vi.fn(() => res)
      await streamWebVideo(db, {query: Object.fromEntries(new URL(playable.url, 'http://localhost').searchParams),
        headers: {range}} as unknown as Request, res, item.id)
      return {res, text: Buffer.concat(chunks).toString()}
    }
    expect((await stream('bytes=0-4')).text).toBe('first')
    expect(stale.destroyed).toBe(true)
    expect(axios.get).toHaveBeenNthCalledWith(2, mirror, expect.objectContaining({headers: {referer: 'https://player.example.com/', Range: 'bytes=0-4'}}))
    expect((await stream('bytes=10-13')).text).toBe('seek')
    expect(axios.get).toHaveBeenNthCalledWith(3, mirror, expect.objectContaining({headers: expect.objectContaining({Range: 'bytes=10-13'})}))
    expect((await stream('bytes=14-17')).res.status).toHaveBeenCalledWith(404)
    expect(axios.get).toHaveBeenCalledTimes(4)
    expect(extractWebVideo).toHaveBeenCalledTimes(1)
  })

  it('does not replace a missing fixed-quality MP4 with a different resolution', async () => {
    vi.mocked(extractWebVideo).mockResolvedValue({...fixture, formats: [fixture.formats[0],
      {...fixture.formats[0], url: 'https://cdn.example.com/low.mp4', height: 480},
    ]})
    const item = await importWebVideo(db, page)
    const playable = await prepareWebVideo(db, item.id, {quality: 720})
    vi.mocked(axios.get).mockResolvedValue({status: 404, headers: {}, data: Readable.from([])})
    const res = new Writable({write(_chunk, _encoding, done) { done() }}) as unknown as Response
    res.status = vi.fn(() => res)
    res.json = vi.fn(() => res)
    await streamWebVideo(db, {query: Object.fromEntries(new URL(playable.url, 'http://localhost').searchParams), headers: {}} as unknown as Request, res, item.id)
    expect(res.status).toHaveBeenCalledWith(404)
    expect(axios.get).toHaveBeenCalledTimes(1)
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
    vi.mocked(extractWebVideo).mockResolvedValue({...fixture, formats: [
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
    expect(extractWebVideo).toHaveBeenCalledTimes(2)
    expect(createMediaRepository(db.drizzle).findById(item.id)?.path).toContain('xhamster.com/videos/')
  })

  it('keeps a fixed quality when an expired root stream is resolved again', async () => {
    vi.mocked(extractWebVideo).mockResolvedValue({...fixture, formats: [fixture.formats[0],
      {...fixture.formats[0], height: 480, url: 'https://video.xhcdn.com/low.mp4'},
    ]})
    const item = await importWebVideo(db, page)
    const playable = await prepareWebVideo(db, item.id, {quality: 480})
    vi.mocked(extractWebVideo).mockResolvedValue({...fixture, formats: [fixture.formats[0],
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
    } as unknown as Request, res, item.id)).rejects.toThrow('Unsupported public HTTPS stream URL')
    expect(axios.get).toHaveBeenCalledTimes(1)
  })
})
