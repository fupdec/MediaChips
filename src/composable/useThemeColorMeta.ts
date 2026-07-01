import { onBeforeUnmount, watch } from 'vue'
import { useHeaderColor } from '@/composable/useHeaderColor'

export function useThemeColorMeta(): void {
  const headerColor = useHeaderColor()

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
