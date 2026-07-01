import { computed } from 'vue'
import { useTheme } from 'vuetify'
import { useSettingsStore } from '@/stores/settings'
import { isRealWinElectron } from '@/utils/electronUi'
import {
  addTransparencyToGradient,
  checkColorForDarkText,
  hexToRgba,
} from '@/utils/headerColorUtils'

export function useHeaderBarStyle(variant: 'app' | 'system' = 'app') {
  const theme = useTheme()
  const settingsStore = useSettingsStore()
  const isWinElectron = isRealWinElectron()

  const SETTINGS = computed(() => settingsStore)

  const color = computed(() => {
    const c = theme.global.current.value.dark
      ? SETTINGS.value.appColorDarkHeader
      : SETTINGS.value.appColorLightHeader

    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', c || '#000000')

    return c || '#000000'
  })

  const colorRGBA = computed(() => {
    const opacity = isWinElectron ? 60 : (variant === 'system' ? 80 : 60)
    return hexToRgba(color.value, opacity)
  })

  const gradient = computed(() => {
    if (SETTINGS.value.headerGradient == '0') return ''

    const g = theme.global.current.value.dark
      ? SETTINGS.value.headerGradientDark
      : SETTINGS.value.headerGradientLight

    if (!g || typeof g !== 'string') return ''

    const alpha = isWinElectron ? 0.6 : (variant === 'system' ? 0.8 : 0.6)

    return 'background:' + addTransparencyToGradient(g, alpha)
  })

  const barTheme = computed(() => {
    if (color.value) {
      return checkColorForDarkText(color.value) ? 'dark' : 'light'
    }
    return 'dark'
  })

  return {
    color,
    colorRGBA,
    gradient,
    barTheme,
    isWinElectron,
  }
}
