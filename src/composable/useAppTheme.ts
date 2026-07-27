import { useTheme } from 'vuetify'
import { useSettingsStore } from '@/stores/settings'
import type { SettingsState } from '@/types/settings'
import { derivePageBackground } from '@/utils/themeBackground'

export function resolveIsDarkMode(settings: SettingsState) {
  if (settings.system_dark_mode == '1') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return settings.darkMode == '1'
}

export function applyAppThemeColors(theme: ReturnType<typeof useTheme>, settings: SettingsState) {
  const lightColors = theme.themes.value.light.colors
  const darkColors = theme.themes.value.dark.colors

  theme.themes.value.light.colors = {
    ...lightColors,
    primary: settings.appColorLightPrimary,
    secondary: settings.appColorLightSecondary,
    background: derivePageBackground(settings.appColorLightPrimary, 'light'),
  }
  theme.themes.value.dark.colors = {
    ...darkColors,
    primary: settings.appColorDarkPrimary,
    secondary: settings.appColorDarkSecondary,
    background: derivePageBackground(settings.appColorDarkPrimary, 'dark'),
  }

  const mode = resolveIsDarkMode(settings) ? 'dark' : 'light'
  theme.change(mode)
}

export function useAppTheme() {
  const theme = useTheme()
  const settings = useSettingsStore()

  function applyTheme() {
    applyAppThemeColors(theme, settings)
  }

  return { applyTheme, resolveIsDarkMode }
}
