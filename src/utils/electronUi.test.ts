import {afterEach, describe, expect, it} from 'vitest'
import {isRealWinElectron, isWinElectronUi} from '@/utils/electronUi'

describe('electronUi', () => {
  const originalUserAgent = navigator.userAgent
  const originalAppInfo = window.appInfo

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent,
    })
    if (originalAppInfo === undefined) delete window.appInfo
    else window.appInfo = originalAppInfo
  })

  function setUserAgent(ua: string) {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: ua,
    })
  }

  it('detects real Windows Electron', () => {
    setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Electron/42.0.0')
    expect(isRealWinElectron()).toBe(true)
    expect(isWinElectronUi()).toBe(true)
  })

  it('does not treat mac Electron as Windows UI by default', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Electron/42.0.0')
    delete window.appInfo
    expect(isRealWinElectron()).toBe(false)
    expect(isWinElectronUi()).toBe(false)
  })

  it('forces Windows UI on mac Electron when appInfo.forceWinUi is set', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Electron/42.0.0')
    window.appInfo = {
      version: '42',
      node: '22',
      chrome: '120',
      forceWinUi: true,
    }
    expect(isRealWinElectron()).toBe(false)
    expect(isWinElectronUi()).toBe(true)
  })
})
