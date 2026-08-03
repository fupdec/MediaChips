import {computed} from 'vue'
import {useDisplay} from 'vuetify'
import {useSettingsStore} from '@/stores/settings'
import {useNavigationLayout} from '@/composable/useNavigationLayout'

/** Eagle-style three-panel browser layout (expanded tags sidebar + inspector). */
export function useBrowserLayout() {
  const settingsStore = useSettingsStore()
  const {mobile} = useDisplay()
  const {useBottomBar} = useNavigationLayout()

  const browserLayoutEnabled = computed(() => settingsStore.browserLayout === '1')

  const useBrowserLayout = computed(() =>
    browserLayoutEnabled.value && !useBottomBar.value && !mobile.value,
  )

  return {
    browserLayoutEnabled,
    useBrowserLayout,
  }
}
