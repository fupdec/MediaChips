import {describe, expect, it, vi} from 'vitest'
import {
  DETECT_FRAME_CONCURRENCY,
  mapDetectFramesWithConcurrency,
} from './faceDetectFrameMap'

describe('mapDetectFramesWithConcurrency', () => {
  it('preserves frame order and skips image reads when empty', async () => {
    const readImage = vi.fn(async (path: string) => ({path}))
    const results = await mapDetectFramesWithConcurrency(
      [
        {framePath: '/f0.jpg', timestamp: 0},
        {framePath: '/f1.jpg', timestamp: 1},
        {framePath: '/f2.jpg', timestamp: 2},
      ],
      {
        concurrency: 2,
        detect: async (frame) => (
          frame.framePath.endsWith('f1.jpg')
            ? [{score: 0.9}]
            : []
        ),
        readImage,
      },
    )

    expect(results.map((row) => row.frame.timestamp)).toEqual([0, 1, 2])
    expect(results[0].sourceImage).toBeNull()
    expect(results[1].sourceImage).toEqual({path: '/f1.jpg'})
    expect(results[2].sourceImage).toBeNull()
    expect(readImage).toHaveBeenCalledTimes(1)
  })

  it('caps in-flight detect calls to the concurrency limit', async () => {
    let inFlight = 0
    let peak = 0
    const frames = Array.from({length: 6}, (_, i) => ({
      framePath: `/f${i}.jpg`,
    }))

    await mapDetectFramesWithConcurrency(frames, {
      concurrency: DETECT_FRAME_CONCURRENCY,
      detect: async () => {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 20))
        inFlight -= 1
        return []
      },
      readImage: async () => null,
    })

    expect(peak).toBeLessThanOrEqual(DETECT_FRAME_CONCURRENCY)
    expect(peak).toBeGreaterThan(1)
  })
})
