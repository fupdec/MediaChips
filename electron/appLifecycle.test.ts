/**
 * @vitest-environment node
 */
import {describe, expect, it, vi} from 'vitest'
import type {BrowserWindow} from 'electron'
import {
  ensureMainWindowOnActivate,
  focusExistingMainWindow,
  formatPortInUseErrorMessage,
  resolveElectronConfigPath,
  shouldDisableHardwareAcceleration,
  shouldHideWindowOnCloseApp,
} from './appLifecycle'

function mockWindow(overrides: {
  destroyed?: boolean
  minimized?: boolean
  visible?: boolean
} = {}): BrowserWindow {
  const {
    destroyed = false,
    minimized = false,
    visible = true,
  } = overrides
  return {
    isDestroyed: () => destroyed,
    isMinimized: () => minimized,
    isVisible: () => visible,
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
  } as unknown as BrowserWindow
}

describe('shouldDisableHardwareAcceleration', () => {
  it('accepts common truthy env strings', () => {
    expect(shouldDisableHardwareAcceleration('1')).toBe(true)
    expect(shouldDisableHardwareAcceleration('TRUE')).toBe(true)
    expect(shouldDisableHardwareAcceleration('yes')).toBe(true)
    expect(shouldDisableHardwareAcceleration('on')).toBe(true)
    expect(shouldDisableHardwareAcceleration('0')).toBe(false)
    expect(shouldDisableHardwareAcceleration(undefined)).toBe(false)
  })
})

describe('resolveElectronConfigPath', () => {
  it('prefers portable dir when set', () => {
    expect(resolveElectronConfigPath({
      portableExecutableDir: '/portable',
      userDataPath: '/userdata',
    })).toBe('/portable/config.json')
    expect(resolveElectronConfigPath({
      userDataPath: '/userdata',
    })).toBe('/userdata/config.json')
  })
})

describe('formatPortInUseErrorMessage', () => {
  it('mentions the port', () => {
    expect(formatPortInUseErrorMessage(12321)).toContain('12321')
  })
})

describe('focusExistingMainWindow', () => {
  it('returns false for missing or destroyed windows', () => {
    expect(focusExistingMainWindow(null)).toBe(false)
    expect(focusExistingMainWindow(mockWindow({destroyed: true}))).toBe(false)
  })

  it('restores, shows, and focuses a hidden minimized window', () => {
    const win = mockWindow({minimized: true, visible: false})
    expect(focusExistingMainWindow(win)).toBe(true)
    expect(win.restore).toHaveBeenCalled()
    expect(win.show).toHaveBeenCalled()
    expect(win.focus).toHaveBeenCalled()
  })
})

describe('ensureMainWindowOnActivate', () => {
  it('shows an existing hidden window instead of recreating it', async () => {
    const win = mockWindow({visible: false})
    const createWindow = vi.fn()
    const waitForBackend = vi.fn()
    const flushPendingMenuAction = vi.fn()

    await ensureMainWindowOnActivate({
      getMainWindow: () => win,
      waitForBackend,
      getPort: () => 12321,
      createWindow,
      flushPendingMenuAction,
    })

    expect(win.show).toHaveBeenCalled()
    expect(win.focus).toHaveBeenCalled()
    expect(flushPendingMenuAction).toHaveBeenCalled()
    expect(createWindow).not.toHaveBeenCalled()
    expect(waitForBackend).not.toHaveBeenCalled()
  })

  it('recreates the main window after it was destroyed', async () => {
    const createWindow = vi.fn()
    const waitForBackend = vi.fn(async () => undefined)
    const flushPendingMenuAction = vi.fn()

    await ensureMainWindowOnActivate({
      getMainWindow: () => null,
      waitForBackend,
      getPort: () => 12321,
      createWindow,
      flushPendingMenuAction,
    })

    expect(waitForBackend).toHaveBeenCalledWith(12321, 600000)
    expect(createWindow).toHaveBeenCalled()
    expect(flushPendingMenuAction).not.toHaveBeenCalled()
  })
})

describe('shouldHideWindowOnCloseApp', () => {
  it('hides on tray-supported platforms while tray mode is on and not quitting', () => {
    expect(shouldHideWindowOnCloseApp({
      supportsTray: true,
      minimizeToTray: true,
      isQuitting: false,
    })).toBe(true)
    expect(shouldHideWindowOnCloseApp({
      supportsTray: true,
      minimizeToTray: true,
      isQuitting: true,
    })).toBe(false)
    expect(shouldHideWindowOnCloseApp({
      supportsTray: false,
      minimizeToTray: true,
      isQuitting: false,
    })).toBe(false)
  })

  it('never hides when quitting (Dock Quit / Cmd+Q must not be aborted)', () => {
    expect(shouldHideWindowOnCloseApp({
      supportsTray: true,
      minimizeToTray: true,
      isQuitting: true,
      trayActive: true,
    })).toBe(false)
  })

  it('never hides when the tray icon is missing', () => {
    expect(shouldHideWindowOnCloseApp({
      supportsTray: true,
      minimizeToTray: true,
      isQuitting: false,
      trayActive: false,
    })).toBe(false)
  })

  it('never hides when tray is disabled', () => {
    expect(shouldHideWindowOnCloseApp({
      supportsTray: true,
      minimizeToTray: false,
      isQuitting: false,
    })).toBe(false)
  })
})
