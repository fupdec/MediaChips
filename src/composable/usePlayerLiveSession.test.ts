import {afterEach, describe, expect, it, vi} from 'vitest'
import {seekDirectPlaybackTo} from './usePlayerLiveSession'

describe('direct seek lifecycle', () => {
  afterEach(() => vi.useRealTimers())
  it('releases a metadata wait immediately when a player is closed', async () => {
    vi.useFakeTimers()
    const video = document.createElement('video')
    const controller = new AbortController()
    const pending = seekDirectPlaybackTo(video, 30, undefined, controller.signal)
    controller.abort()
    await pending
    expect(video.currentTime).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('does not wait for a seek timeout after a decoder failure', async () => {
    vi.useFakeTimers()
    const video = document.createElement('video')
    const pending = seekDirectPlaybackTo(video, 30)
    Object.defineProperty(video, 'error', {value: {code: 4}})
    video.dispatchEvent(new Event('error'))
    await pending
    expect(video.currentTime).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('waits for the actual metadata and cancels an unfinished seek', async () => {
    vi.useFakeTimers()
    const video = document.createElement('video')
    const controller = new AbortController()
    const pending = seekDirectPlaybackTo(video, 30, undefined, controller.signal)
    video.dispatchEvent(new Event('emptied'))
    await Promise.resolve()
    expect(video.currentTime).toBe(0)
    Object.defineProperties(video, {readyState: {value: 1}, duration: {value: 100}})
    video.dispatchEvent(new Event('loadedmetadata'))
    await Promise.resolve()
    expect(video.currentTime).toBe(30)
    controller.abort()
    await pending
    expect(vi.getTimerCount()).toBe(0)
  })
})
