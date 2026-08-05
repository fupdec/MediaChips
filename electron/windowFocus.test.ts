/**
 * @vitest-environment node
 */
import {describe, expect, it, vi} from 'vitest'
import {isBrowserWindowUserFacing} from './windowFocus'
import type {BrowserWindow} from 'electron'

function mockWindow(overrides: Partial<{
  destroyed: boolean
  visible: boolean
  minimized: boolean
  focused: boolean
  occluded: boolean | null
}> = {}): BrowserWindow {
  const {
    destroyed = false,
    visible = true,
    minimized = false,
    focused = true,
    occluded = null,
  } = overrides
  return {
    isDestroyed: () => destroyed,
    isVisible: () => visible,
    isMinimized: () => minimized,
    isFocused: () => focused,
    ...(occluded == null ? {} : {isOccluded: () => occluded}),
  } as unknown as BrowserWindow
}

describe('isBrowserWindowUserFacing', () => {
  it('requires a living visible focused window', () => {
    expect(isBrowserWindowUserFacing(null, {isAppHidden: () => false})).toBe(false)
    expect(isBrowserWindowUserFacing(mockWindow({destroyed: true}), {isAppHidden: () => false})).toBe(false)
    expect(isBrowserWindowUserFacing(mockWindow({visible: false}), {isAppHidden: () => false})).toBe(false)
    expect(isBrowserWindowUserFacing(mockWindow({minimized: true}), {isAppHidden: () => false})).toBe(false)
    expect(isBrowserWindowUserFacing(mockWindow({focused: false}), {isAppHidden: () => false})).toBe(false)
    expect(isBrowserWindowUserFacing(mockWindow(), {isAppHidden: () => false})).toBe(true)
  })

  it('treats occluded and hidden-app states as not user-facing', () => {
    expect(isBrowserWindowUserFacing(mockWindow({occluded: true}), {isAppHidden: () => false})).toBe(false)
    expect(isBrowserWindowUserFacing(mockWindow(), {isAppHidden: () => true})).toBe(false)
  })
})
