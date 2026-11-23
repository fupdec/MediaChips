import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {apiClient} from './apiClient'
import {captureVideoFrame, captureVideoFrameAt, saveWebVideoCurrentFrame} from './webVideoFrames'

vi.mock('./apiClient', () => ({apiClient: {post: vi.fn()}}))

describe('web video frame capture', () => {
  let video: HTMLVideoElement
  const drawImage = vi.fn()
  beforeEach(() => {
    vi.clearAllMocks()
    video = document.createElement('video')
    Object.defineProperties(video, {readyState: {value: 4}, videoWidth: {value: 1920}, videoHeight: {value: 1080},
      seeking: {value: false, configurable: true}})
    video.currentTime = 10
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({drawImage} as never)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,/9j/')
  })

  it('captures a bounded frame from the actual player and saves it as a poster', async () => {
    expect(await saveWebVideoCurrentFrame({video, mediaId: 3})).toBe(true)
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 360)
    expect(apiClient.post).toHaveBeenCalledWith('/api/web-video/3/frame', {image: 'data:image/jpeg;base64,/9j/', target: 'poster', markId: undefined})
  })

  it('does not attach a frame from a different position or an unfinished seek to a marker', async () => {
    expect(await saveWebVideoCurrentFrame({video, mediaId: 3, markId: 7, expectedTime: 20})).toBe(false)
    Object.defineProperty(video, 'seeking', {value: true})
    expect(await saveWebVideoCurrentFrame({video, mediaId: 3, markId: 7, expectedTime: 10})).toBe(false)
    expect(apiClient.post).not.toHaveBeenCalled()
    expect(() => captureVideoFrame(video)).toThrow('frame has loaded')
  })

  it('saves a NAS marker frame through the NAS endpoint', async () => {
    expect(await saveWebVideoCurrentFrame({video, mediaId: 3, markId: 7, expectedTime: 10,
      mediaPath: 'nas://11111111-1111-4111-8111-111111111111/film.mp4'})).toBe(true)
    expect(apiClient.post).toHaveBeenCalledWith('/api/nas/media/3/frame', {image: 'data:image/jpeg;base64,/9j/', target: 'mark', markId: 7})
  })

  it('propagates canvas access failures without saving an invalid thumbnail', async () => {
    vi.mocked(HTMLCanvasElement.prototype.toDataURL).mockImplementation(() => {throw new DOMException('Canvas is tainted', 'SecurityError')})
    await expect(saveWebVideoCurrentFrame({video, mediaId: 3})).rejects.toThrow('Canvas is tainted')
    expect(apiClient.post).not.toHaveBeenCalled()
  })
})


describe('frame capture failures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it.each([NaN, Infinity, -1])('rejects invalid time %s without creating a video or timer', async time => {
    const create = vi.spyOn(document, 'createElement')
    await expect(captureVideoFrameAt('/video', time, new AbortController().signal)).rejects.toThrow('Invalid video frame time')
    expect(create).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  function mockCaptureVideo(duration = 30) {
    const video = document.createElement('video')
    Object.defineProperties(video, {
      duration: {value: duration}, readyState: {value: 4},
      videoWidth: {value: 640}, videoHeight: {value: 360},
    })
    const load = vi.spyOn(video, 'load').mockImplementation(() => {})
    vi.spyOn(document, 'createElement').mockReturnValueOnce(video)
    return {video, load}
  }

  it('fails immediately when the requested frame is beyond the video duration', async () => {
    const {video, load} = mockCaptureVideo()
    const promise = captureVideoFrameAt('/video', 60, new AbortController().signal)
    video.dispatchEvent(new Event('loadedmetadata'))
    await expect(promise).rejects.toThrow('Could not load')
    expect(load).toHaveBeenCalledTimes(1)
    expect(video.hasAttribute('src')).toBe(false)
    expect(video.onloadedmetadata).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cleans up if seeking throws during metadata loading', async () => {
    const {video, load} = mockCaptureVideo()
    Object.defineProperty(video, 'currentTime', {set: () => { throw new Error('Cannot seek') }})
    const promise = captureVideoFrameAt('/video', 20, new AbortController().signal)
    video.dispatchEvent(new Event('loadedmetadata'))
    await expect(promise).rejects.toThrow('Could not load')
    expect(load).toHaveBeenCalledTimes(1)
    expect(video.hasAttribute('src')).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('captures a requested frame and releases the temporary video', async () => {
    const {video, load} = mockCaptureVideo()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({drawImage: vi.fn()} as never)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,frame')
    const promise = captureVideoFrameAt('/video', 20, new AbortController().signal)
    video.dispatchEvent(new Event('loadedmetadata'))
    video.dispatchEvent(new Event('seeked'))
    await expect(promise).resolves.toBe('data:image/jpeg;base64,frame')
    expect(load).toHaveBeenCalledTimes(1)
    expect(video.hasAttribute('src')).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('releases the temporary video and timer on cancellation', async () => {
    const {video, load} = mockCaptureVideo()
    const controller = new AbortController()
    const promise = captureVideoFrameAt('/video', 20, controller.signal)
    controller.abort()
    await expect(promise).rejects.toThrow('Could not load')
    expect(load).toHaveBeenCalledTimes(1)
    expect(video.hasAttribute('src')).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('removes live-player seek listeners and timer after a synchronous seek error', async () => {
    const video = document.createElement('video')
    Object.defineProperties(video, {readyState: {value: 4}, duration: {value: 30},
      currentTime: {get: () => 10, set: value => { if (value === 20) throw new Error('Cannot seek') }}})
    const remove = vi.spyOn(video, 'removeEventListener')
    expect(await saveWebVideoCurrentFrame({video, mediaId: 3, expectedTime: 20})).toBe(false)
    expect(remove).toHaveBeenCalledWith('seeked', expect.any(Function))
    expect(remove).toHaveBeenCalledWith('error', expect.any(Function))
    expect(vi.getTimerCount()).toBe(0)
    expect(apiClient.post).not.toHaveBeenCalled()
  })

  it.each([NaN, Infinity, -1])('does not save a frame for invalid marker time %s', async expectedTime => {
    const video = document.createElement('video')
    Object.defineProperty(video, 'readyState', {value: 4})
    expect(await saveWebVideoCurrentFrame({video, mediaId: 3, expectedTime})).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(apiClient.post).not.toHaveBeenCalled()
  })
})
