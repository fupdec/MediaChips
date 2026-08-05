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
  it('hides only on Windows tray mode while not quitting', () => {
    expect(shouldHideWindowOnCloseApp({
      isWindows: true,
      minimizeToTray: true,
      isQuitting: false,
    })).toBe(true)
    expect(shouldHideWindowOnCloseApp({
      isWindows: true,
      minimizeToTray: true,
      isQuitting: true,
    })).toBe(false)
    expect(shouldHideWindowOnCloseApp({
      isWindows: false,
      minimizeToTray: true,
      isQuitting: false,
    })).toBe(false)
  })
})
