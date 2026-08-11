/**
 * @vitest-environment node
 */
import {describe, expect, it} from 'vitest'
import {
  formatPortInUseErrorMessage,
  resolveElectronConfigPath,
  shouldDisableHardwareAcceleration,
  shouldHideWindowOnCloseApp,
} from './appLifecycle'

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
