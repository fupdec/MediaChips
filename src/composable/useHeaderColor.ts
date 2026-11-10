import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import { useTheme } from 'vuetify'
import { useSettingsStore } from '@/stores/settings'

export function useHeaderColor(): ComputedRef<string> {
  const theme = useTheme()
  const settingsStore = useSettingsStore()

  return computed(() => {
    if (settingsStore.neutralTheme === '1') return theme.global.current.value.colors.surface

    const c = theme.global.current.value.dark
      ? settingsStore.appColorDarkHeader
      : settingsStore.appColorLightHeader

    return c || '#000000'
  })
}
