import {beforeEach, describe, expect, it, vi} from 'vitest'
import {ref} from 'vue'
import {
  BIG_PREVIEW_CONTEXT_MENU_GUARD_MS,
  buildBigPreviewSizeMenuItems,
  getBigPreviewSizeMenuIcon,
  getMuteMenuIcon,
  shouldOpenBigPreviewContextMenu,
  useItemPreviewContextMenu,
} from './useItemPreviewContextMenu'

describe('getBigPreviewSizeMenuIcon', () => {
  it('marks the current size with radiobox-marked', () => {
    expect(getBigPreviewSizeMenuIcon('full_height', 'full_height')).toBe('radiobox-marked')
    expect(getBigPreviewSizeMenuIcon('half', 'original')).toBe('radiobox-blank')
  })
})

describe('getMuteMenuIcon', () => {
  it('reflects muted state', () => {
    expect(getMuteMenuIcon(true)).toBe('volume-off')
    expect(getMuteMenuIcon(false)).toBe('volume-high')
  })
})

describe('shouldOpenBigPreviewContextMenu', () => {
  const baseInput = {
    isBigPreviewVisual: true,
    isBigPreviewCollapsing: false,
    isFileExists: true,
  }

  it('opens only for visual, non-collapsing, existing files', () => {
    expect(shouldOpenBigPreviewContextMenu(baseInput)).toBe(true)
    expect(shouldOpenBigPreviewContextMenu({...baseInput, isBigPreviewVisual: false})).toBe(false)
    expect(shouldOpenBigPreviewContextMenu({...baseInput, isBigPreviewCollapsing: true})).toBe(false)
    expect(shouldOpenBigPreviewContextMenu({...baseInput, isFileExists: false})).toBe(false)
  })
})

describe('buildBigPreviewSizeMenuItems', () => {
  it('builds size menu entries with icon selection', () => {
    const onSelectSize = vi.fn()
    const items = buildBigPreviewSizeMenuItems({
      currentSize: 'two_thirds',
      translate: (key) => key,
      onSelectSize,
    })

    expect(items).toHaveLength(4)
    expect(items[2].icon).toBe('radiobox-marked')
    expect(items[0].icon).toBe('radiobox-blank')

    items[1].action?.()
    expect(onSelectSize).toHaveBeenCalledWith('full_height')
  })
})

describe('useItemPreviewContextMenu', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('handlePreviewMouseDown arms keep-open guard when menu does not open', () => {
    const bigPreviewMenuActive = ref(false)
    const timeouts: {leave?: ReturnType<typeof setTimeout>; contextMenuGuard?: ReturnType<typeof setTimeout>} = {}
    const gridBigPreview = {
      isVisual: ref(true),
      isCollapsing: ref(false),
    }

    const {handlePreviewMouseDown} = useItemPreviewContextMenu({
      media: {id: 1, path: '/video.mp4'},
      isFileExists: true,
      gridBigPreview: gridBigPreview as never,
      bigPreviewMenuActive,
      bigPreviewSize: 'full_height',
      muted: true,
      playSoundOnVideoPreview: '0',
      videoRef: ref(null),
      progress: ref(0),
      timeouts,
      getPreviewEl: () => null,
      getStaticPreviewSubfolder: () => 'thumbs',
      loadThumb: vi.fn(),
      applyBigPreviewMetrics: vi.fn(),
      mediaPath: '/media',
      translate: (key) => key,
      setOption: vi.fn(),
      showContextMenu: vi.fn(),
      isContextMenuOpen: () => false,
      setNotification: vi.fn(),
      refreshThumb: vi.fn(),
      syncMediaItem: vi.fn(),
    })

    handlePreviewMouseDown({button: 2} as MouseEvent)
    expect(bigPreviewMenuActive.value).toBe(true)

    vi.advanceTimersByTime(BIG_PREVIEW_CONTEXT_MENU_GUARD_MS)
    expect(bigPreviewMenuActive.value).toBe(false)
  })

  it('togglePreviewMute flips play_sound_on_video_preview', () => {
    const setOption = vi.fn()

    const {togglePreviewMute} = useItemPreviewContextMenu({
      media: {id: 1, path: '/video.mp4'},
      isFileExists: true,
      gridBigPreview: {
        isVisual: ref(false),
        isCollapsing: ref(false),
      } as never,
      bigPreviewMenuActive: ref(false),
      bigPreviewSize: 'full_height',
      muted: false,
      playSoundOnVideoPreview: '1',
      videoRef: ref(null),
      progress: ref(0),
      timeouts: {},
      getPreviewEl: () => null,
      getStaticPreviewSubfolder: () => 'thumbs',
      loadThumb: vi.fn(),
      applyBigPreviewMetrics: vi.fn(),
      mediaPath: '/media',
      translate: (key) => key,
      setOption,
      showContextMenu: vi.fn(),
      isContextMenuOpen: () => false,
      setNotification: vi.fn(),
      refreshThumb: vi.fn(),
      syncMediaItem: vi.fn(),
    })

    togglePreviewMute()
    expect(setOption).toHaveBeenCalledWith('0', 'play_sound_on_video_preview')
  })
})
