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
} from './appTray'

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
    expect([...bitmap.slice(0, 4)]).toEqual([255, 255, 255, 0])
    expect([...bitmap.slice(4, 8)]).toEqual([255, 255, 255, 255])
  })
})

describe('keepBlackPreserveAlpha', () => {
  it('zeros RGB and keeps antialiased alpha', () => {
    const bitmap = Buffer.from([10, 20, 30, 180])
    keepBlackPreserveAlpha(bitmap)
    expect([...bitmap]).toEqual([0, 0, 0, 180])
  })

  it('can keep white RGB with alpha', () => {
    const bitmap = Buffer.from([10, 20, 30, 180])
    keepBlackPreserveAlpha(bitmap, 'white')
    expect([...bitmap]).toEqual([255, 255, 255, 180])
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
