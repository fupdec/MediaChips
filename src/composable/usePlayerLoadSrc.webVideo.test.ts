import {ref} from 'vue'
import {createPinia, setActivePinia} from 'pinia'
import {beforeEach, afterEach, describe, expect, it, vi} from 'vitest'
import {usePlayerStore} from '@/stores/player'
import {typedApi} from '@/services/typedApi'
import {buildLocalFileUrl} from '@/services/fileService'
import {fetchPlayableInfo, buildVideoStreamUrl, buildLiveStreamUrl} from '@/services/transcodeService'
import {attachWebVideo, disposeWebVideo, prepareWebVideoPlayback} from '@/services/webVideoPlayback'
import {createPlayerLoadSrc} from './usePlayerLoadSrc'
import type {MediaItem, PlayerPlaylistItem} from '@/types/stores'
import type {PlayerPlaybackSharedState} from './usePlayerLiveSession'

const mocks = vi.hoisted(() => ({countViewNumber: vi.fn(), closeMarkAdding: vi.fn(), settings: {
  restorePlaybackTime: '1', transcodeUnsupportedFormats: '1', transcodeMaxHeight: '1080',
}}))
vi.mock('vue-i18n', () => ({useI18n: () => ({t: (key: string) => key})}))
vi.mock('@/stores/app', () => ({useAppStore: () => ({mediaTypes: [], mediaPath: '/tmp/media'})}))
vi.mock('@/stores/settings', () => ({useSettingsStore: () => mocks.settings}))
vi.mock('@/stores/dialogs', () => ({useDialogsStore: () => ({closeMarkAdding: mocks.closeMarkAdding})}))
vi.mock('@/stores/items', () => ({useItemsStore: () => ({countViewNumber: mocks.countViewNumber})}))
vi.mock('@/utils/eventBus', () => ({useEventBus: () => ({emit: vi.fn()})}))
vi.mock('@/services/typedApi', () => ({typedApi: {getVideoMetadata: vi.fn(), getMarksForVideo: vi.fn(), updateVideoMetadata: vi.fn()}}))
vi.mock('@/services/apiClient', () => ({buildApiUrl: (url: string) => url}))
vi.mock('@/services/fileService', () => ({checkFileExists: vi.fn(async () => true), buildLocalFileUrl: vi.fn(() => '/api/get-file?url=preview')}))
vi.mock('@/services/notificationService', () => ({setNotification: vi.fn()}))
vi.mock('@/utils/markThumb', () => ({ensureMarkThumb: vi.fn(), getMarkImagePath: vi.fn()}))
vi.mock('@/services/transcodeService', () => ({buildLiveStreamUrl: vi.fn(), buildVideoStreamUrl: vi.fn(),
  fetchPlayableInfo: vi.fn(), UnsupportedPlaybackError: class extends Error {}}))
vi.mock('@/composable/usePlayerLiveSession', () => ({seekDirectPlaybackTo: vi.fn(async (video: HTMLVideoElement, time: number) => {video.currentTime = time})}))
vi.mock('@/services/webVideoPlayback', () => ({disposeWebVideo: vi.fn(), prepareWebVideoPlayback: vi.fn(),
  attachWebVideo: vi.fn(async (video: HTMLVideoElement, source: {url: string}) => {video.src = source.url})}))

const item = {id: 17, path: 'https://xhamster.com/videos/video-xhAb12', name: 'Test video'} as MediaItem

describe('web video quality changes and recovery', () => {
  let player: ReturnType<typeof usePlayerStore>
  let video: HTMLVideoElement
  let loader: ReturnType<typeof createPlayerLoadSrc>
  let ready: ReturnType<typeof ref<boolean>>
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.settings.transcodeUnsupportedFormats = '1'
    setActivePinia(createPinia())
    player = usePlayerStore()
    video = document.createElement('video')
    Object.defineProperty(video, 'readyState', {value: 4})
    // An errored/replaced DOM source is paused even if the user's intention was playback.
    vi.spyOn(video, 'pause').mockImplementation(() => {})
    vi.spyOn(video, 'load').mockImplementation(() => {video.currentTime = 0})
    vi.spyOn(video, 'play').mockResolvedValue()
    vi.spyOn(video, 'canPlayType').mockImplementation(type => type.includes('mp4a') ? 'probably' : '')
    vi.mocked(buildVideoStreamUrl).mockReturnValue('/api/video/17?source=direct')
    vi.mocked(buildLiveStreamUrl).mockReturnValue('/api/video/17/transcode/stream')
    vi.spyOn(player, 'trackCurrentTime').mockImplementation(() => {})
    vi.spyOn(player, 'changePlayerStatusText').mockImplementation(() => {})
    player.player = video
    player.active = true
    player.media = item
    player.playlist = [{...item, key: '17'} as PlayerPlaylistItem]
    player.currentTime = 43
    video.currentTime = 43
    player.webVideoQuality = 720
    player.volume = 0.4
    player.speed = 1.5
    vi.mocked(typedApi.getVideoMetadata).mockResolvedValue({data: {duration: 100}} as never)
    vi.mocked(typedApi.getMarksForVideo).mockResolvedValue({data: []} as never)
    vi.mocked(prepareWebVideoPlayback).mockResolvedValue({url: 'http://localhost/video.mp4', kind: 'mp4',
      title: 'Test', qualities: [1080, 720, 480], quality: 480, adaptive: false})
    const state = {transcodeSessionId: 0} as PlayerPlaybackSharedState
    const liveSession = {resetTranscodeState: vi.fn(), clearLiveTranscodeHandlers: vi.fn(async () => {}),
      liveStreamUrlOptions: () => ({}), playCurrentLiveStream: vi.fn(async () => {}),
      armDirectSeekStallWatch: vi.fn(), clearDirectSeekStallWatch: vi.fn(), failTranscode: vi.fn(() => {player.playbackError = true})}
    ready = ref(false)
    loader = createPlayerLoadSrc({state, liveSession: liveSession as never, isReady: ready, marks: ref(null),
      isPlayerWindow: ref(false), updateItemVideo: vi.fn(), updatePlayerWindowTitle: vi.fn(), ensureVideoElement: async () => video})
  })
  afterEach(() => {
    clearInterval(player.currentTimeTimeout)
    clearTimeout(player.statusTimeout)
  })

  it.each([
    ['/tmp/h264.mp4', 'direct', '1'], ['/tmp/hevc.mp4', 'stream', '1'],
    ['/tmp/hevc.mkv', 'unsupported', '0'], ['/tmp/hevc.mov', 'stream', '1'],
  ])('tries original %s despite server mode %s (transcode setting %s)', async (path, mode, setting) => {
    mocks.settings.transcodeUnsupportedFormats = setting
    vi.mocked(fetchPlayableInfo).mockResolvedValue({mode, transcodeRequired: mode === 'stream',
      playability: {playable: false, videoCodec: 'hevc', audioCodec: 'aac'}})
    const media = {...item, path}
    player.media = media
    player.playlist = [{...media, key: '17'} as PlayerPlaylistItem]
    await loader.loadSrc(media)
    expect(buildVideoStreamUrl).toHaveBeenCalledWith(expect.any(Function), 17, 'direct')
    expect(buildLiveStreamUrl).not.toHaveBeenCalled()
    expect(video.getAttribute('src')).toBe('/api/video/17?source=direct')
    expect(video.play).toHaveBeenCalledOnce()
    expect(player.usesLiveTranscode).toBe(false)
    expect(player.playbackError).toBe(false)
  })

  it('still tries original playback if the advisory probe request fails', async () => {
    vi.mocked(fetchPlayableInfo).mockRejectedValueOnce(new Error('probe unavailable'))
    const media = {...item, path: '/tmp/movie.mp4'}
    player.playlist = [{...media, key: '17'} as PlayerPlaylistItem]
    await loader.loadSrc(media)
    expect(video.play).toHaveBeenCalledOnce()
    expect(player.playbackError).toBe(false)
    expect(buildLiveStreamUrl).not.toHaveBeenCalled()
  })

  it.each(['1', '0'])('handles unsupported audio with transcode setting %s', async setting => {
    mocks.settings.transcodeUnsupportedFormats = setting
    vi.mocked(fetchPlayableInfo).mockResolvedValue({mode: 'direct',
      playability: {playable: false, videoCodec: 'hevc', audioCodec: 'ac3'}})
    const media = {...item, path: '/tmp/surround.mkv'}
    player.playlist = [{...media, key: '17'} as PlayerPlaylistItem]
    await loader.loadSrc(media)
    expect(player.usesLiveTranscode).toBe(setting === '1')
    if (setting === '1') expect(buildLiveStreamUrl).toHaveBeenCalledOnce()
    else expect(buildVideoStreamUrl).toHaveBeenCalledWith(expect.any(Function), 17, 'direct')
  })

  it('changes quality at the same time while keeping pause, speed and volume, without counting another view', async () => {
    player.paused = true
    await loader.reloadWebVideo({quality: 480})
    expect(prepareWebVideoPlayback).toHaveBeenCalledWith(17, expect.objectContaining({quality: 480, fresh: undefined, signal: expect.any(AbortSignal)}))
    expect(video.currentTime).toBe(43)
    expect(player.currentTime).toBe(43)
    expect(player.paused).toBe(true)
    expect(video.autoplay).toBe(false)
    expect(video.play).not.toHaveBeenCalled()
    expect(video.playbackRate).toBe(1.5)
    expect(video.volume).toBe(0.4)
    expect(mocks.countViewNumber).not.toHaveBeenCalled()
    expect(mocks.closeMarkAdding).not.toHaveBeenCalled()
    expect(player.webVideoLoading).toBe(false)
  })
  it.each(['nas://11111111-1111-4111-8111-111111111111/video.mp4', 'gdrive://movie', '/tmp/movie.mp4', '/tmp/song.mp3'])('plays and closes %s without reading or writing library metadata, markers or views', async path => {
    const preview = {...item, id: 0, path}
    player.media = preview
    player.playlist = [{...preview, key: 'preview'} as PlayerPlaylistItem]
    player.metadata = {}
    await loader.loadSrc(preview)
    if (path.startsWith('/')) {
      expect(buildLocalFileUrl).toHaveBeenCalledWith(path, true)
      expect(prepareWebVideoPlayback).not.toHaveBeenCalled()
      expect(fetchPlayableInfo).not.toHaveBeenCalled()
      expect(video.getAttribute('src')).toBe('/api/get-file?url=preview')
    } else expect(prepareWebVideoPlayback).toHaveBeenCalledWith(0, expect.objectContaining({path: preview.path}))
    expect(video.play).toHaveBeenCalledTimes(1)
    expect(typedApi.getVideoMetadata).not.toHaveBeenCalled()
    expect(typedApi.getMarksForVideo).not.toHaveBeenCalled()
    expect(mocks.countViewNumber).not.toHaveBeenCalled()
    expect(player.isLibraryMedia).toBe(false)
    expect(player.marks).toEqual([])
    await loader.updatePlaybackTime(preview)
    expect(typedApi.updateVideoMetadata).not.toHaveBeenCalled()
  })

  it('resumes after refreshing an errored source and keeps the selected quality', async () => {
    player.paused = false
    player.playbackError = true
    await loader.reloadWebVideo({fresh: true})
    expect(prepareWebVideoPlayback).toHaveBeenCalledWith(17, expect.objectContaining({quality: 720, fresh: true, signal: expect.any(AbortSignal)}))
    expect(attachWebVideo).toHaveBeenCalledWith(video, expect.any(Object), expect.any(Function), expect.any(Function), 43)
    expect(video.play).toHaveBeenCalledTimes(1)
    expect(player.paused).toBe(false)
    expect(player.playbackError).toBe(false)
  })
  it('shows a decode failure that happens before Play instead of leaving the player loading', async () => {
    const preview = {...item, id: 0, path: 'gdrive://legacy'}
    vi.mocked(attachWebVideo).mockImplementationOnce(async () => {player.playbackError = true})
    await loader.loadSrc(preview)
    expect(ready.value).toBe(true)
    expect(player.webVideoLoading).toBe(false)
    expect(player.playbackError).toBe(true)
    expect(video.play).not.toHaveBeenCalled()
    expect(typedApi.getVideoMetadata).not.toHaveBeenCalled()
  })

  it('releases the loading state on resolution failure so a second refresh can recover', async () => {
    vi.mocked(prepareWebVideoPlayback).mockRejectedValueOnce(new Error('Unavailable'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await loader.reloadWebVideo({fresh: true})
    expect(player.webVideoLoading).toBe(false)
    expect(player.playbackError).toBe(true)
    await loader.reloadWebVideo({fresh: true})
    expect(player.playbackError).toBe(false)
    expect(video.currentTime).toBe(43)
    vi.mocked(console.error).mockRestore()
  })

  it('ignores duplicate reloads and seek hotkeys while the source is loading', async () => {
    player.webVideoLoading = true
    await loader.reloadWebVideo({quality: 480})
    player.playerJumpTo(10)
    player.playerStop()
    player.playerPlay()
    expect(prepareWebVideoPlayback).not.toHaveBeenCalled()
    expect(video.currentTime).toBe(43)
    expect(video.play).not.toHaveBeenCalled()
  })

  it('stops a pending remote request and ignores its late response, then reconnects on Play', async () => {
    let finish!: (source: Awaited<ReturnType<typeof prepareWebVideoPlayback>>) => void
    const source = await prepareWebVideoPlayback(17)
    vi.mocked(prepareWebVideoPlayback).mockClear()
    vi.mocked(prepareWebVideoPlayback).mockImplementationOnce(() => new Promise(resolve => {finish = resolve}))
    const pending = loader.loadSrc(item)
    await vi.waitFor(() => expect(prepareWebVideoPlayback).toHaveBeenCalledTimes(1))
    const signal = vi.mocked(prepareWebVideoPlayback).mock.calls[0][1]!.signal!
    player.playerStop()
    expect(signal.aborted).toBe(true)
    expect(player.webVideoLoading).toBe(false)
    expect(player.paused).toBe(true)
    expect(player.currentTime).toBe(0)
    expect(player.playbackError).toBe(false)
    expect(ready.value).toBe(true)
    expect(video.hasAttribute('src')).toBe(false)
    expect(disposeWebVideo).toHaveBeenCalledWith(video)
    finish(source)
    await pending
    expect(attachWebVideo).not.toHaveBeenCalled()
    expect(video.play).not.toHaveBeenCalled()
    expect(mocks.countViewNumber).not.toHaveBeenCalled()
    player.playerPlay()
    await vi.waitFor(() => expect(video.play).toHaveBeenCalledTimes(1))
    expect(prepareWebVideoPlayback).toHaveBeenCalledTimes(2)
    expect(player.resumeRemoteLoadHandler).toBeNull()
  })

  it('stops without a bound video element and ignores late metadata', async () => {
    let finish!: (metadata: unknown) => void
    const other = {...item, id: 18}
    vi.mocked(typedApi.getVideoMetadata).mockImplementationOnce(() => new Promise(resolve => {finish = resolve}) as never)
    const pending = loader.loadSrc(other)
    await vi.waitFor(() => expect(typedApi.getVideoMetadata).toHaveBeenCalledTimes(1))
    player.player = null
    player.playerStop()
    finish({data: {duration: 500}})
    await pending
    expect(player.media?.id).toBe(17)
    expect(player.metadata).toEqual({})
    expect(player.webVideoLoading).toBe(false)
    expect(player.paused).toBe(true)
    expect(prepareWebVideoPlayback).not.toHaveBeenCalled()
  })

  it('clears an attached stream while its manifest is still loading', async () => {
    let finish!: () => void
    vi.mocked(attachWebVideo).mockImplementationOnce(async (element, source) => {
      element.src = source.url
      await new Promise<void>(resolve => {finish = resolve})
    })
    const pending = loader.loadSrc(item)
    await vi.waitFor(() => expect(attachWebVideo).toHaveBeenCalledTimes(1))
    expect(video.hasAttribute('src')).toBe(true)
    player.playerStop()
    expect(video.hasAttribute('src')).toBe(false)
    expect(player.webVideoLoading).toBe(false)
    finish()
    await pending
    expect(video.play).not.toHaveBeenCalled()
    expect(player.paused).toBe(true)
    expect(player.playbackError).toBe(false)
  })

  it('aborts the previous preparation when another source is opened', async () => {
    let finish!: (source: Awaited<ReturnType<typeof prepareWebVideoPlayback>>) => void
    const source = await prepareWebVideoPlayback(17)
    vi.mocked(prepareWebVideoPlayback).mockClear()
    vi.mocked(prepareWebVideoPlayback).mockImplementationOnce(() => new Promise(resolve => {finish = resolve}))
    const previous = loader.loadSrc(item)
    await vi.waitFor(() => expect(prepareWebVideoPlayback).toHaveBeenCalledTimes(1))
    const signal = vi.mocked(prepareWebVideoPlayback).mock.calls[0][1]!.signal!
    const next = {...item, id: 18, path: 'https://xhamster.com/videos/next-xhCd34'}
    await loader.loadSrc(next)
    expect(signal.aborted).toBe(true)
    finish(source)
    await previous
    expect(player.media?.id).toBe(18)
    expect(attachWebVideo).toHaveBeenCalledTimes(1)
    expect(video.play).toHaveBeenCalledTimes(1)
  })

  it('keeps a new load active when the cancelled request rejects later', async () => {
    let fail!: (error: Error) => void
    let finish!: (source: Awaited<ReturnType<typeof prepareWebVideoPlayback>>) => void
    const source = await prepareWebVideoPlayback(17)
    vi.mocked(prepareWebVideoPlayback).mockClear()
    vi.mocked(prepareWebVideoPlayback)
      .mockImplementationOnce(() => new Promise((_resolve, reject) => {fail = reject}))
      .mockImplementationOnce(() => new Promise(resolve => {finish = resolve}))
    const first = loader.loadSrc(item)
    await vi.waitFor(() => expect(prepareWebVideoPlayback).toHaveBeenCalledTimes(1))
    player.playerStop()
    const second = loader.loadSrc(item)
    await vi.waitFor(() => expect(prepareWebVideoPlayback).toHaveBeenCalledTimes(2))
    fail(new Error('Request cancelled'))
    await first
    expect(player.webVideoLoading).toBe(true)
    expect(player.playbackError).toBe(false)
    finish(source)
    await second
    expect(video.play).toHaveBeenCalledTimes(1)
  })

  it('retains the resume position and playback intention after a decoder error', async () => {
    player.paused = false
    vi.mocked(video.play).mockRejectedValueOnce(new DOMException('Decode failed', 'NotSupportedError'))
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await loader.reloadWebVideo({fresh: true})
    expect(player.playbackError).toBe(true)
    expect(player.paused).toBe(false)
    video.currentTime = 0
    player.syncPlaybackState()
    expect(player.currentTime).toBe(43)
    await loader.reloadWebVideo({fresh: true})
    expect(video.currentTime).toBe(43)
    expect(player.playbackError).toBe(false)
    expect(player.paused).toBe(false)
    vi.mocked(console.log).mockRestore()
  })

  it('leaves autoplay-blocked video paused without treating it as a stream failure', async () => {
    vi.mocked(video.play).mockRejectedValueOnce(new DOMException('Autoplay blocked', 'NotAllowedError'))
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await loader.reloadWebVideo()
    expect(player.paused).toBe(true)
    expect(player.playbackError).toBe(false)
    vi.mocked(console.log).mockRestore()
  })
  it.each(['gdrive://movie', 'nas://11111111-1111-4111-8111-111111111111/movie.mp4'])('restores %s from saved metadata on reopen', async path => {
    vi.mocked(typedApi.getVideoMetadata).mockResolvedValueOnce({data: {duration: 100, time: 38}} as never)
    await loader.loadSrc({...item, path})
    expect(attachWebVideo).toHaveBeenCalledWith(video, expect.any(Object), expect.any(Function), expect.any(Function), 38)
    expect(video.currentTime).toBe(38)
    expect(video.play).toHaveBeenCalled()
  })

  it('does not replace current markers with a late response for the previous video', async () => {
    let finish!: (value: unknown) => void
    vi.mocked(typedApi.getMarksForVideo).mockImplementationOnce(() => new Promise(resolve => {finish = resolve}) as never)
    const old = loader.getMarks(item)
    player.media = {...item, id: 18}
    player.marks = [{id: 200, time: 10}] as typeof player.marks
    finish({data: [{id: 100, time: 2}]})
    await old
    expect(player.marks.map(mark => mark.id)).toEqual([200])
  })

  it('serializes a checkpoint and close write with positions captured when requested', async () => {
    let finish!: () => void
    vi.mocked(typedApi.updateVideoMetadata).mockImplementationOnce(() => new Promise(resolve => {finish = () => resolve({} as never)}))
    const checkpoint = loader.updatePlaybackTime(item, 30)
    const close = loader.updatePlaybackTime(item, 45)
    player.currentTime = 0
    await vi.waitFor(() => expect(typedApi.updateVideoMetadata).toHaveBeenCalledTimes(1))
    expect(typedApi.updateVideoMetadata).toHaveBeenNthCalledWith(1, 17, {time: 30})
    finish()
    await Promise.all([checkpoint, close])
    expect(typedApi.updateVideoMetadata).toHaveBeenNthCalledWith(2, 17, {time: 45})
  })

})
