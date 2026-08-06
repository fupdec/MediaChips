import {beforeEach, describe, expect, it, vi} from 'vitest'

const {
  decideInPlacePreviewSeek,
  getLoadedPreviewMediaId,
  planPreviewUrlSeek,
  resolvePreviewUrlStartSeconds,
  shouldApplyPreviewSeek,
  waitForPreviewCanPlay,
  waitForPreviewSeek,
  seekPreviewVideo,
  appendPreviewMediaFragment,
  PREVIEW_INITIAL_SEEK_WAIT_MS,
} = vi.hoisted(() => ({
  decideInPlacePreviewSeek: vi.fn(),
  getLoadedPreviewMediaId: vi.fn(() => 7),
  planPreviewUrlSeek: vi.fn(),
  resolvePreviewUrlStartSeconds: vi.fn((time: number) => time),
  shouldApplyPreviewSeek: vi.fn(() => false),
  waitForPreviewCanPlay: vi.fn(async () => {}),
  waitForPreviewSeek: vi.fn(async () => {}),
  seekPreviewVideo: vi.fn(async () => {}),
  appendPreviewMediaFragment: vi.fn((url: string) => url),
  PREVIEW_INITIAL_SEEK_WAIT_MS: 8000,
}))

vi.mock('@/utils/hoverPreviewPlayback', () => ({
  decideInPlacePreviewSeek,
  getLoadedPreviewMediaId,
  planPreviewUrlSeek,
  resolvePreviewUrlStartSeconds,
  shouldApplyPreviewSeek,
  waitForPreviewCanPlay,
  waitForPreviewSeek,
  seekPreviewVideo,
  appendPreviewMediaFragment,
  PREVIEW_INITIAL_SEEK_WAIT_MS,
}))

import {positionHoverPreviewVideo} from './hoverPreviewVideoPositioning'

function makeVideo(overrides: Partial<HTMLVideoElement> = {}) {
  return {
    currentSrc: 'http://local/media/7',
    currentTime: 1,
    duration: 100,
    seeking: false,
    src: '',
    removeAttribute: vi.fn(),
    ...overrides,
  } as HTMLVideoElement
}

describe('positionHoverPreviewVideo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('seeks in place when decision is seek', async () => {
    decideInPlacePreviewSeek.mockReturnValue({kind: 'seek', time: 12})
    const onPositioned = vi.fn()
    const video = makeVideo()

    const result = await positionHoverPreviewVideo({
      video,
      mediaId: 7,
      targetTime: 12,
      isCancelled: () => false,
      resolveUrl: async () => null,
      chunkSeconds: 30,
      setLiveMode: vi.fn(),
      onPositioned,
    })

    expect(result).toBe('positioned')
    expect(seekPreviewVideo).toHaveBeenCalledWith(video, 12, expect.any(Function))
    expect(onPositioned).toHaveBeenCalled()
  })

  it('returns cancelled when token flips during busy wait', async () => {
    decideInPlacePreviewSeek.mockReturnValue({kind: 'busy'})
    waitForPreviewSeek.mockImplementation(async () => {})
    let cancelled = false
    const result = await positionHoverPreviewVideo({
      video: makeVideo({seeking: true}),
      mediaId: 7,
      targetTime: 5,
      isCancelled: () => {
        cancelled = true
        return cancelled
      },
      resolveUrl: async () => null,
      chunkSeconds: 30,
      setLiveMode: vi.fn(),
      onPositioned: vi.fn(),
    })

    expect(result).toBe('cancelled')
  })

  it('reloads live source once and seeks relative time', async () => {
    decideInPlacePreviewSeek.mockReturnValue({kind: 'needs-reload'})
    planPreviewUrlSeek.mockReturnValue({
      kind: 'live',
      reload: true,
      relative: 4,
    })
    shouldApplyPreviewSeek.mockReturnValue(true)
    const setLiveMode = vi.fn()
    const video = makeVideo({currentSrc: ''})
    const resolveUrl = vi.fn(async () => 'http://local/live?start=30')

    const result = await positionHoverPreviewVideo({
      video,
      mediaId: 7,
      targetTime: 34,
      allowLiveChunkSwitch: true,
      isCancelled: () => false,
      resolveUrl,
      chunkSeconds: 30,
      setLiveMode,
      onPositioned: vi.fn(),
    })

    expect(result).toBe('positioned')
    expect(setLiveMode).toHaveBeenCalledWith(true)
    expect(video.src).toBe('http://local/live?start=30')
    expect(waitForPreviewCanPlay).toHaveBeenCalledWith(video, expect.any(Function), {live: true})
    expect(seekPreviewVideo).toHaveBeenCalledWith(
      video,
      4,
      expect.any(Function),
      {timeoutMs: 8000},
    )
  })

  it('deferSeek returns after canplay without awaiting mid-file seek', async () => {
    decideInPlacePreviewSeek.mockReturnValue({kind: 'not-applicable'})
    planPreviewUrlSeek.mockReturnValue({
      kind: 'file',
      reload: true,
      nextTime: 45,
    })
    shouldApplyPreviewSeek.mockReturnValue(true)
    const video = makeVideo({currentSrc: ''})

    const result = await positionHoverPreviewVideo({
      video,
      mediaId: 7,
      targetTime: 45,
      deferSeek: true,
      isCancelled: () => false,
      resolveUrl: async () => 'http://local/media/7?source=direct',
      chunkSeconds: 30,
      setLiveMode: vi.fn(),
      onPositioned: vi.fn(),
    })

    expect(result).toBe('positioned')
    expect(waitForPreviewCanPlay).toHaveBeenCalled()
    expect(seekPreviewVideo).not.toHaveBeenCalled()
  })

  it('does not assign src after cancellation during URL resolve', async () => {
    decideInPlacePreviewSeek.mockReturnValue({kind: 'needs-reload'})
    let cancelled = false
    const video = makeVideo({currentSrc: ''})
    const resolveUrl = vi.fn(async () => {
      cancelled = true
      return 'http://stale'
    })

    const result = await positionHoverPreviewVideo({
      video,
      mediaId: 7,
      targetTime: 10,
      isCancelled: () => cancelled,
      resolveUrl,
      chunkSeconds: 30,
      setLiveMode: vi.fn(),
      onPositioned: vi.fn(),
    })

    expect(result).toBe('cancelled')
    expect(video.src).toBe('')
    expect(planPreviewUrlSeek).not.toHaveBeenCalled()
  })
})
