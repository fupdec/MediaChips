import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import { useTheme } from 'vuetify'
import { useSettingsStore } from '@/stores/settings'

export function useHeaderColor(): ComputedRef<string> {
  const theme = useTheme()
  const settingsStore = useSettingsStore()

  return computed(() => {
    const c = theme.global.current.value.dark
      ? settingsStore.appColorDarkHeader
      : settingsStore.appColorLightHeader

    return c || '#000000'
  })
}
