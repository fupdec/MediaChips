import {describe, expect, it, vi, beforeEach, afterEach} from 'vitest'
import {ref} from 'vue'
import {
  PREVIEW_PLAY_CLICK_DELAY_MS,
  resolveMediaClickAction,
  resolvePreviewClickAction,
  resolvePreviewDblClickAction,
  resolvePreviewKeyAction,
  resolvePreviewPlayer,
  useItemPreviewCardActions,
} from './useItemPreviewCardActions'
import type {MediaItem} from '@/types/stores'

describe('resolvePreviewClickAction', () => {
  const base = {
    isCollapsing: false,
    isShrinking: false,
    isBigPreviewVisual: false,
  }

  it('ignores while collapsing or shrinking', () => {
    expect(resolvePreviewClickAction({...base, isCollapsing: true})).toBe('ignore')
    expect(resolvePreviewClickAction({...base, isShrinking: true})).toBe('ignore')
  })

  it('dismisses fullscreen big preview', () => {
    expect(resolvePreviewClickAction({...base, isBigPreviewVisual: true})).toBe('dismiss-big-preview')
  })

  it('plays on thumb click', () => {
    expect(resolvePreviewClickAction(base)).toBe('play')
  })
})

describe('resolveMediaClickAction', () => {
  it('matches preview click policy', () => {
    expect(resolveMediaClickAction({
      isCollapsing: false,
      isShrinking: false,
      isBigPreviewVisual: false,
    })).toBe('play')
  })
})

describe('resolvePreviewDblClickAction', () => {
  it('opens in the system player unless dismissing big preview', () => {
    expect(resolvePreviewDblClickAction({
      isCollapsing: false,
      isShrinking: false,
      isBigPreviewVisual: false,
    })).toBe('play-system')
    expect(resolvePreviewDblClickAction({
      isCollapsing: true,
      isShrinking: false,
      isBigPreviewVisual: false,
    })).toBe('ignore')
    expect(resolvePreviewDblClickAction({
      isCollapsing: false,
      isShrinking: false,
      isBigPreviewVisual: true,
    })).toBe('dismiss-big-preview')
  })
})

describe('resolvePreviewKeyAction', () => {
  it('dismisses cinema preview on Escape', () => {
    expect(resolvePreviewKeyAction({
      key: 'Escape',
      isCollapsing: false,
      isBigPreviewVisual: true,
    })).toBe('dismiss-big-preview')
  })

  it('ignores other keys and collapse', () => {
    expect(resolvePreviewKeyAction({
      key: 'Enter',
      isCollapsing: false,
      isBigPreviewVisual: true,
    })).toBe('ignore')
    expect(resolvePreviewKeyAction({
      key: 'Escape',
      isCollapsing: true,
      isBigPreviewVisual: true,
    })).toBe('ignore')
    expect(resolvePreviewKeyAction({
      key: 'Escape',
      isCollapsing: false,
      isBigPreviewVisual: false,
    })).toBe('ignore')
  })
})

describe('resolvePreviewPlayer', () => {
  it('defaults non-player values to builtin', () => {
    expect(resolvePreviewPlayer('system')).toBe('system')
    expect(resolvePreviewPlayer('builtin')).toBe('builtin')
    expect(resolvePreviewPlayer(undefined)).toBe('builtin')
    expect(resolvePreviewPlayer({type: 'click'})).toBe('builtin')
  })
})

describe('useItemPreviewCardActions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('plays builtin after click delay', () => {
    const playVideo = vi.fn()
    const media = {id: 7, path: '/a.mp4'} as MediaItem

    const {handleMediaClick} = useItemPreviewCardActions({
      media: () => media,
      playTime: () => 12,
      isShrinking: () => false,
      isBigPreviewOpen: () => false,
      gridBigPreview: {
        isCollapsing: ref(false),
        isVisual: ref(false),
      } as never,
      bigPreviewMenuActive: ref(false),
      stopPlayingPreview: () => {},
      clearContextMenu: () => {},
      playVideo,
      syncMediaItem: () => {},
    })

    handleMediaClick()
    expect(playVideo).not.toHaveBeenCalled()
    vi.advanceTimersByTime(PREVIEW_PLAY_CLICK_DELAY_MS)
    expect(playVideo).toHaveBeenCalledWith({video: media, player: 'default', time: 12})
  })

  it('cancels builtin play and opens system player on double-click', () => {
    const playVideo = vi.fn()
    const media = {id: 7, path: '/a.mp4'} as MediaItem

    const {handleMediaClick, handlePreviewDblClick} = useItemPreviewCardActions({
      media: () => media,
      playTime: () => undefined,
      isShrinking: () => false,
      isBigPreviewOpen: () => false,
      gridBigPreview: {
        isCollapsing: ref(false),
        isVisual: ref(false),
      } as never,
      bigPreviewMenuActive: ref(false),
      stopPlayingPreview: () => {},
      clearContextMenu: () => {},
      playVideo,
      syncMediaItem: () => {},
    })

    handleMediaClick()
    handlePreviewDblClick()
    vi.advanceTimersByTime(PREVIEW_PLAY_CLICK_DELAY_MS + 50)

    expect(playVideo).toHaveBeenCalledTimes(1)
    expect(playVideo).toHaveBeenCalledWith({video: media, player: 'system'})
  })
})
