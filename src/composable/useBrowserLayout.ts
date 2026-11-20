import {computed} from 'vue'
import {useRoute} from 'vue-router'
import {useDisplay} from 'vuetify'

/** Pages that render an items grid (media / meta category / tag page / folders). */
export function isItemsGridRoute(path: string): boolean {
  return path === '/media' || path.startsWith('/media/')
    || path === '/meta' || path.startsWith('/meta/')
    || path === '/tag' || path.startsWith('/tag/')
    || path === '/folders' || path.startsWith('/folders/')
}

export function isFoldersRoute(path: string): boolean {
  return path === '/folders' || path.startsWith('/folders/')
}

/** Routes that show the inspector panel (items grids including folders). */
export function isInspectorRoute(path: string): boolean {
  return isItemsGridRoute(path)
}

/** Browser layout: tags sidebar + inspector + compact control deck. */
export function useBrowserLayout() {
  const route = useRoute()
  const {mobile} = useDisplay()

  /** Always on — classic layout has been removed. */
  const browserLayoutEnabled = computed(() => true)

  /** Compact control deck on items pages. */
  const useItemsControlDeck = computed(() => true)

  /** Desktop inspector interactions are independent of navigation placement. */
  const useBrowserLayout = computed(() =>
    !mobile.value,
  )

  const showInspector = computed(() =>
    useBrowserLayout.value && isInspectorRoute(route.path),
  )

  return {
    browserLayoutEnabled,
    useItemsControlDeck,
    useBrowserLayout,
    showInspector,
  }
}
