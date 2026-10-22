import {beforeEach, afterEach, describe, expect, it, vi} from 'vitest'
import {WebVideoPlayableSchema} from '@shared/webVideo'
import {apiClient} from './apiClient'
import Hls from 'hls.js'
import {attachWebVideo, disposeWebVideo, prepareWebVideoPlayback, hlsFailureCode, hlsFailure} from './webVideoPlayback'

vi.mock('./apiClient', () => ({apiClient: {get: vi.fn()}, buildApiUrl: (url: string) => `http://localhost:12321${url}`}))
vi.mock('./authSession', () => ({getAuthToken: () => 'test token'}))
vi.mock('hls.js', () => ({default: class FakeHls {
  static Events = {ERROR: 'error', MANIFEST_PARSED: 'parsed', DESTROYING: 'destroying'}
  static isSupported = () => true
  static instances: FakeHls[] = []
  listeners = new Map<string, Set<(...args: any[]) => void>>()
  destroyed = false
  constructor(public config: Record<string, unknown>) {FakeHls.instances.push(this)}
  on(event: string, handler: (...args: any[]) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(handler)
  }
  off(event: string, handler: (...args: any[]) => void) {this.listeners.get(event)?.delete(handler)}
  emit(event: string, data?: unknown) {for (const handler of [...this.listeners.get(event) || []]) handler(event, data)}
  loadSource = vi.fn()
  attachMedia = vi.fn()
  destroy() {this.destroyed = true; this.emit('destroying'); this.listeners.clear()}
}}))

type FakeHls = {config: Record<string, unknown>; destroyed: boolean; emit: (event: string, data?: unknown) => void}
const instances = () => (Hls as unknown as {instances: FakeHls[]}).instances
const source = WebVideoPlayableSchema.parse({url: '/api/web-video/1/stream?session=a&resource=root', kind: 'hls', title: 'Test'})
const latest = async () => {
  await vi.waitFor(() => expect(instances().length).toBeGreaterThan(0))
  return instances().at(-1)!
}

describe('web video playback lifecycle', () => {
  let video: HTMLVideoElement
  beforeEach(() => {
    vi.clearAllMocks()
    instances().length = 0
    video = document.createElement('video')
    vi.spyOn(video, 'canPlayType').mockReturnValue('')
  })
  afterEach(() => disposeWebVideo(video))

  it('sends quality/refresh parameters and authorizes the proxy URL', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({data: source})
    const result = await prepareWebVideoPlayback(1, {quality: 720, fresh: true})
    expect(apiClient.get).toHaveBeenCalledWith('/api/web-video/1/playable', expect.objectContaining({params: {quality: 720, fresh: '1'}}))
    expect(result.url).toContain('&token=test%20token')
  })

  it('passes cancellation to the remote preparation request', async () => {
    const controller = new AbortController()
    vi.mocked(apiClient.get).mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      options!.signal!.addEventListener!('abort', () => reject(new Error('cancelled')))
    }))
    const pending = prepareWebVideoPlayback(1, {signal: controller.signal})
    const rejection = expect(pending).rejects.toThrow('cancelled')
    controller.abort()
    await rejection
    expect(apiClient.get).toHaveBeenCalledWith('/api/web-video/1/playable', expect.objectContaining({signal: controller.signal}))
  })

  it('releases a pending HLS manifest immediately when stopped', async () => {
    const onError = vi.fn()
    const pending = attachWebVideo(video, source, () => true, onError)
    await pending
    expect(instances()).toHaveLength(0)
    const connecting = attachWebVideo(video, source, () => false, onError)
    const hls = await latest()
    disposeWebVideo(video)
    await connecting
    expect(hls.destroyed).toBe(true)
    expect(onError).not.toHaveBeenCalled()
  })

  it('starts HLS at the resume position and releases it on a source switch', async () => {
    const pending = attachWebVideo(video, source, () => false, vi.fn(), 42)
    const hls = await latest()
    expect(hls.config.startPosition).toBe(42)
    expect(hls.config).toMatchObject({maxBufferLength: 30, maxMaxBufferLength: 60,
      maxBufferSize: 30 * 1024 * 1024, backBufferLength: 30})
    expect(video.crossOrigin).toBe('anonymous')
    hls.emit('parsed')
    await pending
    disposeWebVideo(video)
    expect(hls.destroyed).toBe(true)
  })

  it.each(['/tmp/local.mp4', 'nas://11111111-1111-4111-8111-111111111111/movie.mp4', 'gdrive://movie'])('selects a verified copy independently of the compatibility path %s', async path => {
    vi.mocked(apiClient.get).mockResolvedValue({data: {kind: 'mp4', url: '/api/Media/8/copies/stream?copyId=copy&version=v1', title: ''}})
    const result = await prepareWebVideoPlayback(8, {path, copies: true})
    expect(apiClient.get).toHaveBeenCalledWith('/api/Media/8/copies/playable', expect.any(Object))
    expect(result.url).toContain('copyId=copy&version=v1&token=test%20token')
  })

  it('prepares an authenticated NAS stream using the NAS API', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({data: {...source, kind: 'mp4', url: '/api/nas/media/8/stream?session=nas'}})
    const result = await prepareWebVideoPlayback(8, {path: 'nas://11111111-1111-4111-8111-111111111111/film.mp4'})
    expect(apiClient.get).toHaveBeenCalledWith('/api/nas/media/8/playable', expect.objectContaining({params: {}}))
    expect(result.url).toContain('/api/nas/media/8/stream?session=nas&token=test%20token')
    await attachWebVideo(video, result, () => false, vi.fn())
    expect(instances()).toHaveLength(0)
  })
  it('prepares playback-only NAS files by path and refreshes without requiring a media ID', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    vi.mocked(apiClient.get).mockResolvedValue({data: {...source, kind: 'mp4', url: `/api/nas/connections/${id}/stream?session=preview`}})
    const result = await prepareWebVideoPlayback(0, {path: `nas://${id}/Кино/video%201.mp4`, fresh: true})
    expect(apiClient.get).toHaveBeenCalledWith(`/api/nas/connections/${id}/playable`, expect.objectContaining({params: {path: 'Кино/video 1.mp4'}}))
    expect(result.url).toContain('session=preview&token=test%20token')
  })

  it('rejects a fatal manifest failure and cleans up instead of accepting a broken stream', async () => {
    const pending = attachWebVideo(video, source, () => false, vi.fn())
    const rejection = expect(pending).rejects.toMatchObject({code: 'network_error'})
    const hls = await latest()
    hls.emit('error', {fatal: true})
    await rejection
    expect(hls.destroyed).toBe(true)
  })

  it('reports fatal errors after startup once and ignores an obsolete player session', async () => {
    const onError = vi.fn()
    let stale = false
    const pending = attachWebVideo(video, source, () => stale, onError)
    const hls = await latest()
    hls.emit('parsed')
    await pending
    hls.emit('error', {fatal: false})
    expect(onError).not.toHaveBeenCalled()
    stale = true
    hls.emit('error', {fatal: true})
    expect(onError).not.toHaveBeenCalled()
    stale = false
    hls.emit('error', {fatal: true})
    expect(onError).toHaveBeenCalledTimes(1)
    expect(hls.destroyed).toBe(true)
  })

  it('settles an abandoned manifest load when the player closes', async () => {
    let stale = false
    const pending = attachWebVideo(video, source, () => stale, vi.fn())
    const hls = await latest()
    stale = true
    disposeWebVideo(video)
    await pending
    expect(hls.destroyed).toBe(true)
  })

  it('uses native MP4 playback without constructing an HLS instance', async () => {
    await attachWebVideo(video, {...source, kind: 'mp4'}, () => false, vi.fn())
    expect(video.src).toContain('/api/web-video/1/stream')
    expect(instances()).toHaveLength(0)
  })
})


describe('Google Drive playback proxy', () => {
  it('opens a temporary Drive file directly without reading a library record', async () => {
    vi.mocked(apiClient.get).mockClear()
    const source = await prepareWebVideoPlayback(0, {path: 'gdrive://movie', fresh: true})
    expect(apiClient.get).not.toHaveBeenCalled()
    expect(source.url).toBe('http://localhost:12321/api/drive/files/movie/stream?token=test%20token')
    expect(source.qualities).toEqual([])
    expect(source.kind).toBe('mp4')
  })
  it('resolves Drive media and adds authorization to a URL without a query', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({data: {url: '/api/drive/files/movie/stream', kind: 'mp4', title: 'Movie'}} as never)
    const source = await prepareWebVideoPlayback(99, {path: 'gdrive://movie'})
    expect(apiClient.get).toHaveBeenCalledWith('/api/drive/media/99/playable', expect.objectContaining({params: {}}))
    expect(source.url).toBe('http://localhost:12321/api/drive/files/movie/stream?token=test%20token')
  })
})

 it.each([[410, 'session_expired'], [401, 'auth_required'], [403, 'permission_denied'], [429, 'rate_limited']])('classifies HLS HTTP %s without exposing URLs', (code, expected) => {
  expect(hlsFailureCode({response: {code: Number(code)}})).toBe(expected)
})

it('retains the HLS response retry delay without passing its diagnostics to the UI', () => {
  expect(hlsFailure({response: {code: 429}, networkDetails: {getResponseHeader: () => '12', responseURL: 'https://secret?token=private'}})).toEqual({code: 'rate_limited', retryAfter: 12})
})
