import {describe, expect, it, vi} from 'vitest'
import {
  claimHoverVideoPreview,
  releaseHoverVideoPreview,
} from '@/utils/hoverPreviewSession'

describe('hoverPreviewSession', () => {
  it('stops the previous card when another claims hover video', () => {
    const firstStop = vi.fn()
    const secondStop = vi.fn()

    claimHoverVideoPreview(1, firstStop)
    claimHoverVideoPreview(2, secondStop)

    expect(firstStop).toHaveBeenCalledTimes(1)
    expect(secondStop).not.toHaveBeenCalled()

    releaseHoverVideoPreview(2)
    claimHoverVideoPreview(3, vi.fn())
    expect(secondStop).not.toHaveBeenCalled()
  })

  it('does not stop itself when reclaiming the same media', () => {
    const stop = vi.fn()
    claimHoverVideoPreview(9, stop)
    claimHoverVideoPreview(9, stop)
    expect(stop).not.toHaveBeenCalled()
    releaseHoverVideoPreview(9)
  })
})
