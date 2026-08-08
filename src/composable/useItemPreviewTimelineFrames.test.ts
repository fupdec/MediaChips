import {describe, expect, it, vi} from 'vitest'
import {nextTick, ref} from 'vue'

vi.mock('@/utils/thumbSource', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/thumbSource')>()
  return {
    ...actual,
    resolveGridSpriteDisplayUrl: vi.fn(() => '/api/get-file?url=grids%2F7.jpg'),
  }
})

vi.mock('@/utils/thumbDisplayCache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/thumbDisplayCache')>()
  return {
    ...actual,
    setCachedThumb: vi.fn(),
  }
})

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

  it('loads frames when mounted while already active in timeline view', async () => {
    const isMounted = ref(false)
    const getImg = vi.fn(async () => {})
    const runImageProbe = vi.fn(async () => true)

    const {gridSpriteUrl} = useItemPreviewTimelineFrames({
      media: {id: 7} as never,
      isFileExists: true,
      isMounted: () => isMounted.value,
      isViewTimeline: true,
      showTimelinePreview: false,
      mediaDuration: 100,
      durationLabel: '01:40',
      mediaAspectRatio: 16 / 9,
      isTaskRunning: false,
      mediaPath: '/media',
      itemsView: 2,
      previewActive: true,
      thumb: ref(null),
      resolveThumbFallback: () => null,
      getImg,
      runImageProbe,
      getStoryEl: () => null,
      getStoryWrapperEl: () => null,
    })

    await nextTick()
    expect(getImg).not.toHaveBeenCalled()

    isMounted.value = true
    await vi.waitFor(() => expect(getImg).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(gridSpriteUrl.value).toContain('7.jpg'))
    expect(runImageProbe).toHaveBeenCalled()
  })
})
