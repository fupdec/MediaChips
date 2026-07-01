import { computed, onBeforeUnmount, watch } from 'vue'
import { useTheme } from 'vuetify'
import { useSettingsStore } from '@/stores/settings'

export function useThemeColorMeta(): void {
  const theme = useTheme()
  const settingsStore = useSettingsStore()

  const headerColor = computed(() => {
    const c = theme.global.current.value.dark
      ? settingsStore.appColorDarkHeader
      : settingsStore.appColorLightHeader

    return c || '#000000'
  })

  const stop = watch(
    headerColor,
    (color) => {
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', color)
    },
    { immediate: true },
  )

  onBeforeUnmount(stop)
}
