import {describe, expect, it} from 'vitest'
import {
  applyBigPreviewMetrics,
  canOpenBigPreview,
  hasActivePreviewState,
  restorePreviewLayout,
  shouldKeepBigPreviewOpen,
} from './useItemPreviewBigPreviewSession'

describe('canOpenBigPreview', () => {
  const baseInput = {
    isHovered: true,
    isWindowFocused: true,
    isFileExists: true,
    hasPlaybackError: false,
    hoverPreviewReady: true,
    isVideoPreviewEnabled: true,
    isBigPreviewEnabled: true,
    isContextMenuOpen: false,
  }

  it('returns true when all conditions pass', () => {
    expect(canOpenBigPreview(baseInput)).toBe(true)
  })

  it('returns false when hover preview is not ready', () => {
    expect(canOpenBigPreview({...baseInput, hoverPreviewReady: false})).toBe(false)
  })

  it('returns false when context menu is open', () => {
    expect(canOpenBigPreview({...baseInput, isContextMenuOpen: true})).toBe(false)
  })

  it('returns false when big preview setting is disabled', () => {
    expect(canOpenBigPreview({...baseInput, isBigPreviewEnabled: false})).toBe(false)
  })
})

describe('shouldKeepBigPreviewOpen', () => {
  it('keeps open while context menu or preview menu is active', () => {
    expect(shouldKeepBigPreviewOpen({
      isBigPreviewOpen: true,
      isContextMenuOpen: true,
      isBigPreviewMenuActive: false,
    })).toBe(true)

    expect(shouldKeepBigPreviewOpen({
      isBigPreviewOpen: true,
      isContextMenuOpen: false,
      isBigPreviewMenuActive: true,
    })).toBe(true)
  })

  it('does not keep open when preview is closed', () => {
    expect(shouldKeepBigPreviewOpen({
      isBigPreviewOpen: false,
      isContextMenuOpen: true,
      isBigPreviewMenuActive: true,
    })).toBe(false)
  })
})

describe('hasActivePreviewState', () => {
  it('detects hover, big preview, or shrink activity', () => {
    expect(hasActivePreviewState({
      isHovered: true,
      isBigPreviewActive: false,
      isShrinking: false,
    })).toBe(true)

    expect(hasActivePreviewState({
      isHovered: false,
      isBigPreviewActive: true,
      isShrinking: false,
    })).toBe(true)

    expect(hasActivePreviewState({
      isHovered: false,
      isBigPreviewActive: false,
      isShrinking: true,
    })).toBe(true)

    expect(hasActivePreviewState({
      isHovered: false,
      isBigPreviewActive: false,
      isShrinking: false,
    })).toBe(false)
  })
})

describe('restorePreviewLayout', () => {
  it('clears big-preview frame and child inline styles', () => {
    const el = document.createElement('div')
    el.style.position = 'fixed'
    el.style.top = '10px'
    el.style.setProperty('--big-preview-native-width', '640px')

    const thumb = document.createElement('div')
    thumb.className = 'thumb'
    thumb.style.width = '100px'
    thumb.style.opacity = '0.5'
    el.appendChild(thumb)

    restorePreviewLayout(el)

    expect(el.style.position).toBe('')
    expect(el.style.top).toBe('')
    expect(el.style.getPropertyValue('--big-preview-native-width')).toBe('')
    expect(thumb.style.width).toBe('')
    expect(thumb.style.opacity).toBe('')
  })
})

describe('applyBigPreviewMetrics', () => {
  it('sets native width and height css variables', () => {
    const preview = document.createElement('div')

    applyBigPreviewMetrics(preview, 1280, 720)

    expect(preview.style.getPropertyValue('--big-preview-native-width')).toBe('1280px')
    expect(preview.style.getPropertyValue('--big-preview-native-height')).toBe('720px')
  })

  it('skips metrics when dimensions are missing', () => {
    const preview = document.createElement('div')

    applyBigPreviewMetrics(preview, 0, 720)

    expect(preview.style.getPropertyValue('--big-preview-native-width')).toBe('')
    expect(preview.style.getPropertyValue('--big-preview-native-height')).toBe('')
  })
})
