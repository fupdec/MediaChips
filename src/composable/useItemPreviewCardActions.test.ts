import {describe, expect, it} from 'vitest'
import {
  resolveMediaClickAction,
  resolvePlayAction,
  resolvePreviewClickAction,
} from './useItemPreviewCardActions'

describe('resolvePreviewClickAction', () => {
  const base = {
    isCollapsing: false,
    isShrinking: false,
    isBigPreviewVisual: false,
    browserLayoutActive: false,
  }

  it('ignores while collapsing or shrinking', () => {
    expect(resolvePreviewClickAction({...base, isCollapsing: true})).toBe('ignore')
    expect(resolvePreviewClickAction({...base, isShrinking: true})).toBe('ignore')
  })

  it('dismisses fullscreen big preview', () => {
    expect(resolvePreviewClickAction({...base, isBigPreviewVisual: true})).toBe('dismiss-big-preview')
  })

  it('activates in browser layout', () => {
    expect(resolvePreviewClickAction({...base, browserLayoutActive: true})).toBe('activate')
  })

  it('stops hover preview otherwise', () => {
    expect(resolvePreviewClickAction(base)).toBe('stop-preview')
  })
})

describe('resolveMediaClickAction', () => {
  it('plays when not in big preview or browser layout', () => {
    expect(resolveMediaClickAction({
      isCollapsing: false,
      isShrinking: false,
      isBigPreviewVisual: false,
      browserLayoutActive: false,
    })).toBe('play')
  })
})

describe('resolvePlayAction', () => {
  it('stops when big preview is open or shrinking', () => {
    expect(resolvePlayAction({isBigPreviewOpen: true, isShrinking: false})).toBe('stop-preview')
    expect(resolvePlayAction({isBigPreviewOpen: false, isShrinking: true})).toBe('stop-preview')
  })

  it('force-stops and plays otherwise', () => {
    expect(resolvePlayAction({isBigPreviewOpen: false, isShrinking: false})).toBe('force-stop-and-play')
  })
})
