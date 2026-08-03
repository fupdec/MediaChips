import {computed} from 'vue'
import {useRoute} from 'vue-router'
import {useDisplay} from 'vuetify'
import {useSettingsStore} from '@/stores/settings'
import {useNavigationLayout} from '@/composable/useNavigationLayout'

/** Pages that render an items grid (media / meta category / tag page). */
export function isItemsGridRoute(path: string): boolean {
  return path === '/media' || path.startsWith('/media/')
    || path === '/meta' || path.startsWith('/meta/')
    || path === '/tag' || path.startsWith('/tag/')
}

/** Eagle-style three-panel browser layout (expanded tags sidebar + inspector). */
export function useBrowserLayout() {
  const settingsStore = useSettingsStore()
  const route = useRoute()
  const {mobile} = useDisplay()
  const {useBottomBar} = useNavigationLayout()

  const browserLayoutEnabled = computed(() => settingsStore.browserLayout === '1')

  const useBrowserLayout = computed(() =>
    browserLayoutEnabled.value && !useBottomBar.value && !mobile.value,
  )

  const showInspector = computed(() =>
    useBrowserLayout.value && isItemsGridRoute(route.path),
  )

  return {
    browserLayoutEnabled,
    useBrowserLayout,
    showInspector,
  }
}
