import {describe, expect, it, vi} from 'vitest'
import {ref} from 'vue'
import {
  computeStoryScrollOffset,
  getGridFrameDurationLabel,
  shouldShowFramesInProgressMessage,
  useItemPreviewTimelineFrames,
} from './useItemPreviewTimelineFrames'

describe('getGridFrameDurationLabel', () => {
  it('returns fallback label when media duration is missing', () => {
    expect(getGridFrameDurationLabel(4, 0, '00:00')).toBe('00:00')
  })

  it('returns readable duration from frame percent', () => {
    expect(getGridFrameDurationLabel(4, 100, '00:00')).toBe('00:50')
  })
})

describe('shouldShowFramesInProgressMessage', () => {
  it('shows message only while fallback frames are generating', () => {
    expect(shouldShowFramesInProgressMessage(true, true, true)).toBe(true)
    expect(shouldShowFramesInProgressMessage(true, false, true)).toBe(false)
    expect(shouldShowFramesInProgressMessage(false, true, true)).toBe(false)
    expect(shouldShowFramesInProgressMessage(true, true, false)).toBe(false)
  })
})

describe('computeStoryScrollOffset', () => {
  it('returns null when wrapper fits inside story width', () => {
    expect(computeStoryScrollOffset(40, 200, 200)).toBeNull()
    expect(computeStoryScrollOffset(40, 300, 200)).toBeNull()
  })

  it('computes scroll offset from pointer position', () => {
    expect(computeStoryScrollOffset(100, 200, 600)).toBe(200)
  })
})

describe('useItemPreviewTimelineFrames', () => {
  it('clearTimelineFrames resets timeline state', () => {
    const {gridSpriteUrl, hoverFrameIndex, storyUsesThumbFallback, clearTimelineFrames} =
      useItemPreviewTimelineFrames({
        media: {id: 1} as never,
        isFileExists: true,
        isMounted: true,
        isViewTimeline: false,
        showTimelinePreview: false,
        mediaDuration: 100,
        durationLabel: '01:40',
        mediaAspectRatio: 16 / 9,
        isTaskRunning: false,
        mediaPath: '/media',
        itemsView: 1,
        previewActive: true,
        thumb: ref(null),
        resolveThumbFallback: () => null,
        getImg: vi.fn(async () => {}),
        runImageProbe: vi.fn(async () => false),
        getStoryEl: () => null,
        getStoryWrapperEl: () => null,
      })

    gridSpriteUrl.value = 'grid.jpg'
    hoverFrameIndex.value = 3
    storyUsesThumbFallback.value = true

    clearTimelineFrames()

    expect(gridSpriteUrl.value).toBeNull()
    expect(hoverFrameIndex.value).toBe(0)
    expect(storyUsesThumbFallback.value).toBe(false)
  })
})
