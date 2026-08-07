import {computed} from 'vue'
import {useRoute} from 'vue-router'
import {useDisplay} from 'vuetify'
import {useNavigationLayout} from '@/composable/useNavigationLayout'

/** Pages that render an items grid (media / meta category / tag page). */
export function isItemsGridRoute(path: string): boolean {
  return path === '/media' || path.startsWith('/media/')
    || path === '/meta' || path.startsWith('/meta/')
    || path === '/tag' || path.startsWith('/tag/')
}

/** Browser layout: tags sidebar + inspector + compact control deck. */
export function useBrowserLayout() {
  const route = useRoute()
  const {mobile} = useDisplay()
  const {useBottomBar} = useNavigationLayout()

  /** Always on — classic layout has been removed. */
  const browserLayoutEnabled = computed(() => true)

  /** Compact control deck on items pages. */
  const useItemsControlDeck = computed(() => true)

  /** Full three-panel chrome (browser sidebar + inspector) — desktop only. */
  const useBrowserLayout = computed(() =>
    !useBottomBar.value && !mobile.value,
  )

  const showInspector = computed(() =>
    useBrowserLayout.value && isItemsGridRoute(route.path),
  )

  return {
    browserLayoutEnabled,
    useItemsControlDeck,
    useBrowserLayout,
    showInspector,
  }
}
