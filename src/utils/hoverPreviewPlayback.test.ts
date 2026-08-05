import {describe, it, expect, beforeEach, vi} from 'vitest'
import {
  armHoverPreviewCooldown,
  clampLiveChunkSeek,
  getHoverPreviewCooldownRemaining,
  getLoadedPreviewMediaId,
  getPreviewStreamStart,
  isIgnorablePreviewError,
  pointerRatioToPreviewTime,
  resetHoverPreviewCooldownForTests,
  resolveAbsolutePreviewTime,
  createHoverSeekCoalescer,
  waitForPreviewSeek,
  waitForPreviewCanPlay,
} from './hoverPreviewPlayback'

describe('hoverPreviewPlayback', () => {
  beforeEach(() => {
    resetHoverPreviewCooldownForTests()
  })

  it('tracks cooldown after arming', () => {
    vi.useFakeTimers()
    armHoverPreviewCooldown(500)
    expect(getHoverPreviewCooldownRemaining()).toBe(500)
    vi.advanceTimersByTime(200)
    expect(getHoverPreviewCooldownRemaining()).toBe(300)
    vi.useRealTimers()
  })

  it('detects ignorable preview errors', () => {
    expect(isIgnorablePreviewError({name: 'AbortError'})).toBe(true)
    expect(isIgnorablePreviewError({name: 'NotAllowedError'})).toBe(true)
    expect(isIgnorablePreviewError({name: 'NotSupportedError'})).toBe(false)
  })

  it('reads stream start from url', () => {
    expect(getPreviewStreamStart('http://localhost/api/video/1/transcode/stream?start=12.5')).toBe('12.5')
    expect(getPreviewStreamStart('not a url')).toBeNull()
  })

  it('parses loaded media id from currentSrc only', () => {
    expect(getLoadedPreviewMediaId({currentSrc: 'http://x/api/video/42/transcode/stream?start=0'})).toBe(42)
    expect(getLoadedPreviewMediaId({currentSrc: 'http://localhost:3000/'}, 'http://localhost:3000/')).toBeNull()
    expect(getLoadedPreviewMediaId({currentSrc: ''})).toBeNull()
  })

  it('maps pointer ratio to preview time', () => {
    expect(pointerRatioToPreviewTime(50, {left: 0, width: 100}, 200)).toBe(100)
    expect(pointerRatioToPreviewTime(0, {left: 0, width: 100}, 200)).toBe(0)
    expect(pointerRatioToPreviewTime(10, {left: 0, width: 0}, 200)).toBeNull()
  })

  it('resolves absolute playhead for live streams', () => {
    expect(resolveAbsolutePreviewTime(3, {
      live: true,
      streamUrl: 'http://x/stream?start=10',
    })).toBe(13)
    expect(resolveAbsolutePreviewTime(3, {live: false})).toBe(3)
  })

  it('clamps seeks inside the live chunk', () => {
    const inside = clampLiveChunkSeek(15, 10, 30)
    expect(inside.withinCurrentSegment).toBe(true)
    expect(inside.relativeTime).toBe(5)

    const outside = clampLiveChunkSeek(50, 10, 30)
    expect(outside.withinCurrentSegment).toBe(false)
    expect(outside.clampedAbsolute).toBeCloseTo(39.95, 2)
  })

  it('waitForPreviewSeek resolves immediately when not seeking', async () => {
    const video = {seeking: false, addEventListener: vi.fn(), removeEventListener: vi.fn()} as unknown as HTMLVideoElement
    await expect(waitForPreviewSeek(video, () => false)).resolves.toBeUndefined()
  })

  it('waitForPreviewCanPlay resolves when already buffered', async () => {
    const video = {
      readyState: HTMLMediaElement.HAVE_FUTURE_DATA,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLVideoElement
    await expect(waitForPreviewCanPlay(video, () => false)).resolves.toBeUndefined()
  })

  it('coalesces seek flushes while in flight', async () => {
    const sync = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5))
    })
    const coalescer = createHoverSeekCoalescer({
      resolveTime: (x) => x,
      sync,
      delayMs: 1,
    })

    coalescer.flush(1)
    coalescer.flush(2)
    coalescer.flush(3)
    await new Promise((r) => setTimeout(r, 30))
    expect(sync.mock.calls.map((call) => call[0])).toEqual([1, 3])
  })
})
