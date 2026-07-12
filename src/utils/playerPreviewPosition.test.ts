import {describe, expect, it} from 'vitest'
import {
  computePreviewHoverLeftPx,
  computePreviewTimelineMetrics,
  computeTimelineHoverPercent,
  getPlayerPreviewAspectRatio,
  pickGridFrameIndex,
} from './playerPreviewPosition'
import {getGridFramePercent} from './gridSprite'

describe('playerPreviewPosition', () => {
  it('returns null when timeline is hidden', () => {
    expect(computePreviewTimelineMetrics(
      {left: 0, right: 800, bottom: 600, width: 800, height: 600},
      {left: 24, right: 776, bottom: 0, width: 0, height: 0},
    )).toBeNull()
  })

  it('computes preview anchor above the timeline', () => {
    const metrics = computePreviewTimelineMetrics(
      {left: 0, right: 800, bottom: 600, width: 800, height: 600},
      {left: 24, right: 776, bottom: 560, width: 752, height: 40},
      50,
      72,
    )

    expect(metrics).toEqual({
      bottomPx: 90,
      leftPx: 24,
      widthPx: 752,
    })
  })

  it('maps hover percent to timeline-local x position', () => {
    const metrics = {
      bottomPx: 90,
      leftPx: 24,
      widthPx: 752,
    }

    expect(computePreviewHoverLeftPx(metrics, 50)).toBe(400)
    expect(computeTimelineHoverPercent(400, {left: 24, right: 776, bottom: 560, width: 752, height: 40})).toBe(50)
  })

  it('picks the nearest generated grid frame index', () => {
    expect(pickGridFrameIndex(0)).toBe(0)
    expect(pickGridFrameIndex(12)).toBe(1)
    expect(pickGridFrameIndex(50)).toBe(4)
    expect(pickGridFrameIndex(100)).toBe(8)
    expect(getGridFramePercent(pickGridFrameIndex(50))).toBe(50)
  })

  it('falls back to 16:9 when video dimensions are missing', () => {
    expect(getPlayerPreviewAspectRatio([], 0)).toBe(16 / 9)
    expect(getPlayerPreviewAspectRatio([{width: 1920, height: 1080}], 0)).toBeCloseTo(16 / 9)
    expect(getPlayerPreviewAspectRatio([{width: null, height: null}], 0)).toBe(16 / 9)
  })
})
