import {watch} from 'vue'
import {useRouter} from 'vue-router'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useFsBrowseSelection} from '@/stores/fsBrowseSelection'
import {itemsSelectionScopeKey} from '@/utils/itemsSelectionScope'
import {clearMixedGridAnchor} from '@/composable/useBrowserLayoutHotkeys'

const PRESENTATION_QUERY_KEYS = new Set(['page', 'limit', 'size', 'view', 'sortBy', 'sortDir', 'groupBy'])

/** Mounted once in the app shell, so leaving a list also invalidates its selection. */
export function useItemsSelectionScope() {
  const router = useRouter()
  const app = useAppStore()
  const items = useItemsStore()
  const fs = useFsBrowseSelection()
  watch(() => {
    const route = router.currentRoute.value
    const query = Object.keys(route.query).filter(key => !PRESENTATION_QUERY_KEYS.has(key)).sort()
      .map(key => [key, route.query[key]])
    return JSON.stringify([app.dbPath, route.path, query, itemsSelectionScopeKey(items)])
  }, () => {
    items.clearSelection()
    fs.clearSelection()
    clearMixedGridAnchor()
  }, {flush: 'sync'})

  watch(() => items.isSelect, enabled => {
    if (!enabled) clearMixedGridAnchor()
  }, {flush: 'sync'})

  watch(() => JSON.stringify([items.page, items.limit, items.sortBy, items.sortDir, items.groupBy, items.groupByMetaId]), () => {
    // An anchor belongs to one page/order; the selected IDs belong to the whole query.
    items.resetSelectionAnchor()
    clearMixedGridAnchor()
  }, {flush: 'sync'})
}
