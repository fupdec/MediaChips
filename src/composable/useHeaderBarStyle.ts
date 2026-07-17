import { computed } from 'vue'
import { useTheme } from 'vuetify'
import { useSettingsStore } from '@/stores/settings'
import { useHeaderColor } from '@/composable/useHeaderColor'
import { isRealWinElectron } from '@/utils/electronUi'
import {
  addTransparencyToGradient,
  checkColorForDarkText,
  hexToRgba,
} from '@/utils/headerColorUtils'

export function useHeaderBarStyle(_variant: 'app' | 'system' = 'app') {
  const theme = useTheme()
  const settingsStore = useSettingsStore()
  const isWinElectron = isRealWinElectron()

  const SETTINGS = computed(() => settingsStore)
  const color = useHeaderColor()

  const colorRGBA = computed(() => {
    // Opaque bar: content no longer scrolls underneath, so glass transparency is unused.
    return hexToRgba(color.value, 100)
  })

  const gradient = computed(() => {
    if (SETTINGS.value.headerGradient == '0') return ''

    const g = theme.global.current.value.dark
      ? SETTINGS.value.headerGradientDark
      : SETTINGS.value.headerGradientLight

    if (!g || typeof g !== 'string') return ''

    return 'background:' + addTransparencyToGradient(g, 1)
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
