/**
 * @vitest-environment node
 */
import {describe, expect, it} from 'vitest'
import {resolveRelaunchExecPath} from './relaunchExecPath'

describe('resolveRelaunchExecPath', () => {
  it('prefers PORTABLE_EXECUTABLE_FILE for Windows portable builds', () => {
    expect(resolveRelaunchExecPath({
      PORTABLE_EXECUTABLE_FILE: 'C:\\Apps\\MediaChips.exe',
      APPIMAGE: '/tmp/App.AppImage',
    }, '/tmp/extracted/electron')).toBe('C:\\Apps\\MediaChips.exe')
  })

  it('uses APPIMAGE on Linux AppImage builds', () => {
    expect(resolveRelaunchExecPath({
      APPIMAGE: '/home/user/MediaChips.AppImage',
    }, '/tmp/extracted/electron')).toBe('/home/user/MediaChips.AppImage')
  })

  it('falls back to process.execPath', () => {
    expect(resolveRelaunchExecPath({}, '/usr/bin/electron')).toBe('/usr/bin/electron')
  })
})
