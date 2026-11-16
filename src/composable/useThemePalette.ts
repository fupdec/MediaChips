import {useAppTheme} from '@/composable/useAppTheme'
import {setOption} from '@/services/settingsService'
import {useSettingsStore} from '@/stores/settings'

type PaletteColors = {header: string; headerEnd: string; primary: string; secondary: string}
type ThemePalette = {light: PaletteColors; dark: PaletteColors}
type PaletteTarget = 'light' | 'dark' | 'both'

export function paletteGradient({header, headerEnd}: PaletteColors) {
  return `linear-gradient(to right, ${header}, ${headerEnd})`
}

function paletteOptions({light, dark}: ThemePalette, target: PaletteTarget) {
  const lightOptions = {
    appColorLightHeader: light.header,
    appColorLightPrimary: light.primary,
    appColorLightSecondary: light.secondary,
    headerGradientLight: paletteGradient(light),
  }
  const darkOptions = {
    appColorDarkHeader: dark.header,
    appColorDarkPrimary: dark.primary,
    appColorDarkSecondary: dark.secondary,
    headerGradientDark: paletteGradient(dark),
  }
  return Object.entries({
    ...(target !== 'dark' ? lightOptions : {}),
    ...(target !== 'light' ? darkOptions : {}),
  }) as Array<[keyof (typeof lightOptions & typeof darkOptions), string]>
}

export function useThemePalette() {
  const settings = useSettingsStore()
  const {applyTheme, resolveIsDarkMode} = useAppTheme()

  function isPaletteActive(palette: ThemePalette, target: PaletteTarget) {
    return paletteOptions(palette, target)
      .every(([key, value]) => settings[key].toLowerCase() === value.toLowerCase())
  }

  async function applyPalette(palette: ThemePalette, target: PaletteTarget) {
    const writes = paletteOptions(palette, target).map(([key, value]) => setOption(value, key))
    applyTheme()
    const results = await Promise.allSettled(writes)
    return results.every(result => result.status === 'fulfilled')
  }

  return {
    isPaletteActive,
    applyPalette,
    activeTheme: () => resolveIsDarkMode(settings) ? 'dark' as const : 'light' as const,
  }
}
