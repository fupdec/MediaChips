import {beforeEach, describe, expect, it, vi} from 'vitest'
import {apiClient} from './apiClient'
import {captureVideoFrame, saveWebVideoCurrentFrame} from './webVideoFrames'

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
