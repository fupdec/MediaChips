import fs from 'fs'
import os from 'os'
import path from 'path'
import {describe, expect, it} from 'vitest'
import {resolveWindowIconPath} from './windowIcon'

describe('resolveWindowIconPath', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-window-icon-'))
  const distIcons = path.join(tmpRoot, 'dist', 'icons')
  const legacyIcons = path.join(tmpRoot, 'icons')

  fs.mkdirSync(distIcons, {recursive: true})
  fs.mkdirSync(legacyIcons, {recursive: true})
  fs.writeFileSync(path.join(distIcons, 'favicon.ico'), 'ico')
  fs.writeFileSync(path.join(distIcons, 'icon.png'), 'png')
  fs.writeFileSync(path.join(legacyIcons, 'icon.png'), 'legacy')

  it('prefers favicon.ico on Windows', () => {
    expect(resolveWindowIconPath(tmpRoot, 'win32')).toBe(path.join(distIcons, 'favicon.ico'))
  })

  it('prefers icon.png on non-Windows', () => {
    expect(resolveWindowIconPath(tmpRoot, 'darwin')).toBe(path.join(distIcons, 'icon.png'))
    expect(resolveWindowIconPath(tmpRoot, 'linux')).toBe(path.join(distIcons, 'icon.png'))
  })

  it('falls back to legacy icons/ when dist icons are missing', () => {
    const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-window-icon-empty-'))
    fs.mkdirSync(path.join(emptyRoot, 'icons'), {recursive: true})
    fs.writeFileSync(path.join(emptyRoot, 'icons', 'icon.png'), 'legacy')
    expect(resolveWindowIconPath(emptyRoot, 'win32')).toBe(
      path.join(emptyRoot, 'icons', 'icon.png'),
    )
  })
})
