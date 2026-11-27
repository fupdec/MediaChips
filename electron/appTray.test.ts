/**
 * @vitest-environment node
 */
import {describe, expect, it, vi} from 'vitest'
import {getTrayMenuLabels} from '../shared/electron/trayMenuI18n'
import {
  applyMacTrayTemplateBitmap,
  keepBlackPreserveAlpha,
  strengthenTrayAlpha,
  buildDockMenuTemplate,
  buildTrayMenuTemplate,
  isTraySupportedPlatform,
  resolveTraySourcePath,
  buildIco,
} from './appTray'
import path from 'path'

describe('buildIco', () => {
  it('writes an icon directory followed by the PNG entries', () => {
    const a = Buffer.from([1, 2, 3])
    const b = Buffer.from([4, 5])
    const ico = buildIco([{size: 16, png: a}, {size: 256, png: b}])
    expect(ico.readUInt16LE(2)).toBe(1)  // icon
    expect(ico.readUInt16LE(4)).toBe(2)  // two images
    expect(ico.readUInt8(6)).toBe(16)
    expect(ico.readUInt8(22)).toBe(0)  // 256 is stored as 0
    expect(ico.readUInt32LE(6 + 8)).toBe(3)
    expect(ico.readUInt32LE(6 + 12)).toBe(38)  // 6 + 2 * 16
    expect(ico.readUInt32LE(22 + 12)).toBe(41)
    expect([...ico.subarray(38)]).toEqual([1, 2, 3, 4, 5])
  })
})

describe('resolveTraySourcePath', () => {
  const root = path.join('app')
  const file = (dir: string, name: string) => path.join(root, dir, 'icons', name)

  it('prefers the outline tray asset from the build', () => {
    const present = new Set([file('dist', 'trayTemplate.png'), file('public', 'trayTemplate.png'), file('dist', 'icon.png')])
    expect(resolveTraySourcePath(root, candidate => present.has(candidate))).toBe(file('dist', 'trayTemplate.png'))
  })

  it('takes the outline asset from public/ when an older dist/ lacks it, not the colored logo', () => {
    const present = new Set([file('dist', 'icon.png'), file('public', 'trayTemplate.png')])
    expect(resolveTraySourcePath(root, candidate => present.has(candidate))).toBe(file('public', 'trayTemplate.png'))
  })
})

describe('applyMacTrayTemplateBitmap', () => {
  it('makes a solid black silhouette with binary alpha', () => {
    // BGRA: dark bg, purple logo, soft semi-transparent edge
    const bitmap = Buffer.from([
      10, 10, 10, 255,
      200, 40, 180, 255,
      120, 80, 100, 90,
    ])
    applyMacTrayTemplateBitmap(bitmap)
    expect([...bitmap.slice(0, 4)]).toEqual([0, 0, 0, 0])
    expect([...bitmap.slice(4, 8)]).toEqual([0, 0, 0, 255])
    expect([...bitmap.slice(8, 12)]).toEqual([0, 0, 0, 0])
  })

  it('can fill a white silhouette for dark trays', () => {
    const bitmap = Buffer.from([
      0, 0, 0, 0,
      255, 255, 255, 255,
    ])
    applyMacTrayTemplateBitmap(bitmap, 'white')
    // Premultiplied: transparent stays 0,0,0,0 (255,255,255,0 renders as an opaque white square).
    expect([...bitmap.slice(0, 4)]).toEqual([0, 0, 0, 0])
    expect([...bitmap.slice(4, 8)]).toEqual([255, 255, 255, 255])
  })
})

describe('keepBlackPreserveAlpha', () => {
  it('zeros RGB and keeps antialiased alpha', () => {
    const bitmap = Buffer.from([10, 20, 30, 180])
    keepBlackPreserveAlpha(bitmap)
    expect([...bitmap]).toEqual([0, 0, 0, 180])
  })

  it('writes premultiplied white: RGB follows alpha', () => {
    const bitmap = Buffer.from([10, 20, 30, 180, 9, 9, 9, 0])
    keepBlackPreserveAlpha(bitmap, 'white')
    expect([...bitmap]).toEqual([180, 180, 180, 180, 0, 0, 0, 0])
  })
})

describe('strengthenTrayAlpha', () => {
  it('normalizes faint downscaled outline alpha to full opacity', () => {
    const bitmap = Buffer.from([
      0, 0, 0, 0,
      0, 0, 0, 80,
      0, 0, 0, 40,
    ])
    strengthenTrayAlpha(bitmap)
    expect(bitmap[3]).toBe(0)
    expect(bitmap[7]).toBe(255)
    expect(bitmap[11]).toBe(128)
  })

  it('leaves already-opaque glyphs unchanged', () => {
    const bitmap = Buffer.from([0, 0, 0, 255, 0, 0, 0, 180])
    strengthenTrayAlpha(bitmap)
    expect([...bitmap]).toEqual([0, 0, 0, 255, 0, 0, 0, 180])
  })
})

describe('isTraySupportedPlatform', () => {
  it('supports Windows, macOS, and Linux', () => {
    expect(isTraySupportedPlatform('win32')).toBe(true)
    expect(isTraySupportedPlatform('darwin')).toBe(true)
    expect(isTraySupportedPlatform('linux')).toBe(true)
    expect(isTraySupportedPlatform('freebsd')).toBe(false)
  })
})

describe('buildTrayMenuTemplate', () => {
  function createDeps(platform: string, locale = 'en') {
    return {
      platform,
      labels: getTrayMenuLabels(locale),
      showMainWindow: vi.fn(),
      hideMainWindow: vi.fn(),
      sendMenuAction: vi.fn(),
      onLock: vi.fn(),
      quitApp: vi.fn(),
      setIsQuitting: vi.fn(),
    }
  }

  it('includes show/hide, media actions, and Exit on Windows', () => {
    const deps = createDeps('win32')
    const labels = buildTrayMenuTemplate(deps)
      .map((item) => ('label' in item ? item.label : item.type))

    expect(labels).toEqual([
      'Show MediaChips',
      'Hide MediaChips',
      'separator',
      'Add Media',
      'Settings',
      'Lock',
      'separator',
      'Check for Updates',
      'separator',
      'Exit',
    ])
  })

  it('localizes labels for Russian', () => {
    const deps = createDeps('win32', 'ru')
    const labels = buildTrayMenuTemplate(deps)
      .map((item) => ('label' in item ? item.label : item.type))

    expect(labels).toContain('Показать MediaChips')
    expect(labels).toContain('Добавить медиа')
    expect(labels).toContain('Настройки')
    expect(labels).toContain('Выход')
  })

  it('uses Quit on macOS', () => {
    const deps = createDeps('darwin')
    const items = buildTrayMenuTemplate(deps)
    const last = items[items.length - 1]
    expect(last && 'label' in last ? last.label : null).toBe('Quit')
  })

  it('uses Exit on Linux', () => {
    const deps = createDeps('linux')
    const items = buildTrayMenuTemplate(deps)
    const last = items[items.length - 1]
    expect(last && 'label' in last ? last.label : null).toBe('Exit')
  })

  it('wires menu actions and quit', () => {
    const deps = createDeps('linux')
    const items = buildTrayMenuTemplate(deps)
    const byLabel = (label: string) =>
      items.find((item) => 'label' in item && item.label === label)

    byLabel('Show MediaChips')?.click?.(undefined as never, undefined as never, undefined as never)
    expect(deps.showMainWindow).toHaveBeenCalled()

    byLabel('Hide MediaChips')?.click?.(undefined as never, undefined as never, undefined as never)
    expect(deps.hideMainWindow).toHaveBeenCalled()

    byLabel('Add Media')?.click?.(undefined as never, undefined as never, undefined as never)
    expect(deps.sendMenuAction).toHaveBeenCalledWith('addMedia')

    byLabel('Settings')?.click?.(undefined as never, undefined as never, undefined as never)
    expect(deps.showMainWindow).toHaveBeenCalledTimes(2)
    expect(deps.sendMenuAction).toHaveBeenCalledWith('settings')

    byLabel('Lock')?.click?.(undefined as never, undefined as never, undefined as never)
    expect(deps.onLock).toHaveBeenCalled()

    byLabel('Check for Updates')?.click?.(undefined as never, undefined as never, undefined as never)
    expect(deps.sendMenuAction).toHaveBeenCalledWith('checkUpdates')

    byLabel('Exit')?.click?.(undefined as never, undefined as never, undefined as never)
    expect(deps.setIsQuitting).toHaveBeenCalledWith(true)
    expect(deps.quitApp).toHaveBeenCalled()
  })
})

describe('buildDockMenuTemplate', () => {
  it('omits Quit and keeps app actions', () => {
    const deps = {
      labels: getTrayMenuLabels('en'),
      showMainWindow: vi.fn(),
      hideMainWindow: vi.fn(),
      sendMenuAction: vi.fn(),
      onLock: vi.fn(),
    }
    const labels = buildDockMenuTemplate(deps)
      .map((item) => ('label' in item ? item.label : item.type))

    expect(labels).toEqual([
      'Show MediaChips',
      'Hide MediaChips',
      'separator',
      'Add Media',
      'Settings',
      'Lock',
      'separator',
      'Check for Updates',
    ])
  })
})
