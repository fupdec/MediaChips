import {describe, expect, it} from 'vitest'
import {
  appMenuStateFromSettings,
  isAppMenuActionChecked,
  normalizeAppMenuGapSize,
  parseAppMenuCheckedState,
  parseGapMenuAction,
  parseLocaleMenuAction,
  parseThemeMenuAction,
} from './appMenuState'

describe('appMenuState', () => {
  it('maps system/light/dark theme from settings flags', () => {
    expect(appMenuStateFromSettings({systemDarkMode: '1', darkMode: '0'}).theme).toBe('system')
    expect(appMenuStateFromSettings({systemDarkMode: '0', darkMode: '0'}).theme).toBe('light')
    expect(appMenuStateFromSettings({systemDarkMode: '0', darkMode: '1'}).theme).toBe('dark')
  })

  it('normalizes legacy numeric gap sizes', () => {
    expect(normalizeAppMenuGapSize('2')).toBe('m')
    expect(normalizeAppMenuGapSize('xs')).toBe('xs')
    expect(normalizeAppMenuGapSize('xl')).toBe('xl')
  })

  it('treats collapsed panels as unchecked visibility', () => {
    const state = appMenuStateFromSettings({
      sidebarCollapsed: '1',
      inspectorCollapsed: '0',
    })
    expect(state.sidebarVisible).toBe(false)
    expect(state.inspectorVisible).toBe(true)
    expect(isAppMenuActionChecked('toggleSidebar', state)).toBe(false)
    expect(isAppMenuActionChecked('toggleInspector', state)).toBe(true)
  })

  it('parses prefixed menu actions', () => {
    expect(parseThemeMenuAction('setTheme:system')).toBe('system')
    expect(parseLocaleMenuAction('setLocale:ru')).toBe('ru')
    expect(parseGapMenuAction('setGapSize:l')).toBe('l')
    expect(parseThemeMenuAction('toggleTheme')).toBeNull()
  })

  it('round-trips a checked-state payload', () => {
    const parsed = parseAppMenuCheckedState({
      locale: 'ja',
      theme: 'dark',
      sfwMode: true,
      gapSize: 's',
      minimizeToTray: true,
      sidebarVisible: false,
      inspectorVisible: true,
    })
    expect(parsed.locale).toBe('ja')
    expect(parsed.theme).toBe('dark')
    expect(parsed.sfwMode).toBe(true)
    expect(parsed.gapSize).toBe('s')
    expect(parsed.minimizeToTray).toBe(true)
    expect(parsed.sidebarVisible).toBe(false)
    expect(parsed.inspectorVisible).toBe(true)
  })
})
