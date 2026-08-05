import {describe, expect, it} from 'vitest'
import {
  buildPreviewContainerClasses,
  buildPreviewHostClasses,
  getPlaybackTimelinePercent,
  getProgressPosition,
} from './useItemPreviewDisplay'

describe('buildPreviewHostClasses', () => {
  it('includes host variant and missing-file flag', () => {
    expect(buildPreviewHostClasses('embedded', false)).toEqual([
      'video-preview-host',
      'video-preview-host--embedded',
      {'no-file': true},
    ])
  })
})

describe('buildPreviewContainerClasses', () => {
  const base = {
    isHovered: false,
    isBigPreviewActive: false,
    isBigPreviewCollapsing: false,
    isShrinking: false,
    showVideoPreview: false,
    showTimelinePreview: false,
    hoverPreviewReady: true,
    isFullscreenBigPreview: false,
    isVideoPreviewEnabled: true,
    isGridExpanding: false,
    isGridCollapsing: false,
    collapsePreviewFading: false,
    bigPreviewSize: 'full_height' as const,
  }

  it('marks hover-ready when not fullscreen', () => {
    expect(buildPreviewContainerClasses(base)['is-hover-preview-ready']).toBe(true)
  })

  it('applies size class only for stable fullscreen', () => {
    const classes = buildPreviewContainerClasses({
      ...base,
      isFullscreenBigPreview: true,
      bigPreviewSize: 'half',
    })
    expect(classes['big-preview-size-half']).toBe(true)
    expect(classes['video-preview-container--expanded']).toBe(true)
  })

  it('skips size class while collapsing', () => {
    const classes = buildPreviewContainerClasses({
      ...base,
      isFullscreenBigPreview: true,
      isGridCollapsing: true,
      bigPreviewSize: 'half',
    })
    expect(classes['big-preview-size-half']).toBeUndefined()
  })
})

describe('progress helpers', () => {
  it('maps progress to right-offset position', () => {
    expect(getProgressPosition(25, 100)).toBe('75%')
    expect(getProgressPosition(0, 0)).toBe('100%')
  })

  it('clamps timeline percent', () => {
    expect(getPlaybackTimelinePercent(50, 100)).toBe(50)
    expect(getPlaybackTimelinePercent(150, 100)).toBe(100)
    expect(getPlaybackTimelinePercent(10, 0)).toBe(0)
  })
})
