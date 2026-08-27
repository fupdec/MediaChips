import {
  APP_MENU_LOCALES,
  normalizeAppMenuLocale,
  type AppMenuLocale,
} from './appMenuI18n'

export const APP_MENU_THEMES = ['system', 'light', 'dark'] as const
export const APP_MENU_GAP_SIZES = ['xs', 's', 'm', 'l', 'xl'] as const

export type AppMenuThemeMode = (typeof APP_MENU_THEMES)[number]
export type AppMenuGapSize = (typeof APP_MENU_GAP_SIZES)[number]

export type AppMenuCheckedState = {
  locale: AppMenuLocale
  theme: AppMenuThemeMode
  sfwMode: boolean
  gapSize: AppMenuGapSize
  minimizeToTray: boolean
  playInSystemPlayer: boolean
  separatePlayerWindow: boolean
  playSoundOnPreview: boolean
  bottomBar: boolean
  showPlaylists: boolean
  showMarkers: boolean
  showTrash: boolean
  sidebarVisible: boolean
  inspectorVisible: boolean
}

export type AppMenuThemeAction = `setTheme:${AppMenuThemeMode}`
export type AppMenuLocaleAction = `setLocale:${AppMenuLocale}`
export type AppMenuGapAction = `setGapSize:${AppMenuGapSize}`

export type AppMenuSettingAction =
  | AppMenuThemeAction
  | AppMenuLocaleAction
  | AppMenuGapAction
  | 'toggleSfwMode'
  | 'toggleMinimizeToTray'
  | 'toggleSystemPlayer'
  | 'toggleSeparatePlayerWindow'
  | 'togglePreviewSound'
  | 'toggleBottomBar'
  | 'toggleNavPlaylists'
  | 'toggleNavMarkers'
  | 'toggleNavTrash'
  | 'toggleSidebar'
  | 'toggleInspector'

const LEGACY_GAP_SIZE: Record<string, AppMenuGapSize> = {
  '0': 'xs',
  '1': 's',
  '2': 'm',
  '3': 'l',
  '4': 'xl',
  '5': 'xl',
}

export const DEFAULT_APP_MENU_STATE: AppMenuCheckedState = {
  locale: 'en',
  theme: 'system',
  sfwMode: false,
  gapSize: 'm',
  minimizeToTray: false,
  playInSystemPlayer: false,
  separatePlayerWindow: true,
  playSoundOnPreview: true,
  bottomBar: false,
  showPlaylists: true,
  showMarkers: true,
  showTrash: true,
  sidebarVisible: true,
  inspectorVisible: true,
}

export function isFlagEnabled(value: unknown): boolean {
  return value === true || value === 1 || value === '1'
}

export function normalizeAppMenuTheme(input: {
  systemDarkMode?: unknown
  darkMode?: unknown
}): AppMenuThemeMode {
  if (isFlagEnabled(input.systemDarkMode)) return 'system'
  return isFlagEnabled(input.darkMode) ? 'dark' : 'light'
}

export function normalizeAppMenuGapSize(value: unknown): AppMenuGapSize {
  const raw = String(value || '').trim().toLowerCase()
  if ((APP_MENU_GAP_SIZES as readonly string[]).includes(raw)) {
    return raw as AppMenuGapSize
  }
  return LEGACY_GAP_SIZE[raw] || 'm'
}

export function appMenuStateFromSettings(input: {
  locale?: unknown
  systemDarkMode?: unknown
  darkMode?: unknown
  sfwMode?: unknown
  gapSize?: unknown
  minimizeToTray?: unknown
  playInSystemPlayer?: unknown
  separatePlayerWindow?: unknown
  playSoundOnPreview?: unknown
  bottomBar?: unknown
  showPlaylists?: unknown
  showMarkers?: unknown
  showTrash?: unknown
  sidebarCollapsed?: unknown
  inspectorCollapsed?: unknown
}): AppMenuCheckedState {
  return {
    locale: normalizeAppMenuLocale(input.locale),
    theme: normalizeAppMenuTheme({
      systemDarkMode: input.systemDarkMode,
      darkMode: input.darkMode,
    }),
    sfwMode: isFlagEnabled(input.sfwMode),
    gapSize: normalizeAppMenuGapSize(input.gapSize),
    minimizeToTray: isFlagEnabled(input.minimizeToTray),
    playInSystemPlayer: isFlagEnabled(input.playInSystemPlayer),
    separatePlayerWindow: isFlagEnabled(input.separatePlayerWindow),
    playSoundOnPreview: isFlagEnabled(input.playSoundOnPreview),
    bottomBar: isFlagEnabled(input.bottomBar),
    showPlaylists: isFlagEnabled(input.showPlaylists),
    showMarkers: isFlagEnabled(input.showMarkers),
    showTrash: isFlagEnabled(input.showTrash),
    sidebarVisible: !isFlagEnabled(input.sidebarCollapsed),
    inspectorVisible: !isFlagEnabled(input.inspectorCollapsed),
  }
}

export function parseAppMenuCheckedState(value: unknown): AppMenuCheckedState {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return appMenuStateFromSettings({
    locale: raw.locale,
    systemDarkMode: raw.theme === 'system' ? '1' : '0',
    darkMode: raw.theme === 'dark' ? '1' : '0',
    sfwMode: raw.sfwMode,
    gapSize: raw.gapSize,
    minimizeToTray: raw.minimizeToTray,
    playInSystemPlayer: raw.playInSystemPlayer,
    separatePlayerWindow: raw.separatePlayerWindow,
    playSoundOnPreview: raw.playSoundOnPreview,
    bottomBar: raw.bottomBar,
    showPlaylists: raw.showPlaylists,
    showMarkers: raw.showMarkers,
    showTrash: raw.showTrash,
    sidebarCollapsed: raw.sidebarVisible === false || raw.sidebarVisible === '0' ? '1' : '0',
    inspectorCollapsed: raw.inspectorVisible === false || raw.inspectorVisible === '0' ? '1' : '0',
  })
}

export function parseThemeMenuAction(action: string): AppMenuThemeMode | null {
  const prefix = 'setTheme:'
  if (!action.startsWith(prefix)) return null
  const value = action.slice(prefix.length)
  return (APP_MENU_THEMES as readonly string[]).includes(value)
    ? value as AppMenuThemeMode
    : null
}

export function parseLocaleMenuAction(action: string): AppMenuLocale | null {
  const prefix = 'setLocale:'
  if (!action.startsWith(prefix)) return null
  const value = action.slice(prefix.length)
  return (APP_MENU_LOCALES as readonly string[]).includes(value)
    ? value as AppMenuLocale
    : null
}

export function parseGapMenuAction(action: string): AppMenuGapSize | null {
  const prefix = 'setGapSize:'
  if (!action.startsWith(prefix)) return null
  const value = action.slice(prefix.length)
  return (APP_MENU_GAP_SIZES as readonly string[]).includes(value)
    ? value as AppMenuGapSize
    : null
}

export function isAppMenuActionChecked(action: string, state: AppMenuCheckedState): boolean {
  const theme = parseThemeMenuAction(action)
  if (theme) return state.theme === theme
  const locale = parseLocaleMenuAction(action)
  if (locale) return state.locale === locale
  const gap = parseGapMenuAction(action)
  if (gap) return state.gapSize === gap

  switch (action) {
    case 'toggleSfwMode':
      return state.sfwMode
    case 'toggleMinimizeToTray':
      return state.minimizeToTray
    case 'toggleSystemPlayer':
      return state.playInSystemPlayer
    case 'toggleSeparatePlayerWindow':
      return state.separatePlayerWindow
    case 'togglePreviewSound':
      return state.playSoundOnPreview
    case 'toggleBottomBar':
      return state.bottomBar
    case 'toggleNavPlaylists':
      return state.showPlaylists
    case 'toggleNavMarkers':
      return state.showMarkers
    case 'toggleNavTrash':
      return state.showTrash
    case 'toggleSidebar':
      return state.sidebarVisible
    case 'toggleInspector':
      return state.inspectorVisible
    default:
      return false
  }
}
