import {ref, watch} from 'vue'
import {useItemsStore} from '@/stores/items'
import {typedApi} from '@/services/typedApi'

export function useSelectionFilesize() {
  const itemsStore = useItemsStore()
  const filesize = ref<number | null>(null)
  const loading = ref(false)

  watch(
    () => ({
      type: itemsStore.type,
      ids: [...new Set(itemsStore.selection)],
      revision: itemsStore.selectionRevision,
      loaded: itemsStore.entities.map(item => ({id: item.id, filesize: item.filesize})),
    }),
    ({type, ids, loaded, revision}, _, onCleanup) => {
      filesize.value = null
      loading.value = false
      if (type !== 'media' || !ids.length) return

      const byId = new Map(loaded.map(item => [item.id, item.filesize]))
      if (ids.every(id => byId.has(id) && byId.get(id) != null)) {
        filesize.value = ids.reduce((sum, id) => sum + Number(byId.get(id)), 0)
        return
      }

      loading.value = true
      const controller = new AbortController()
      let current = true
      const scope = itemsStore.filterSelectionScope
      const wholeFilter = scope && scope.revision === revision && scope.count === ids.length ? scope : null
      // Coalesce rapid clicks; never display the previous selection's total.
      const timer = setTimeout(async () => {
        try {
          if (wholeFilter) {
            // Whole filter result selected: one server-side aggregate instead of chunked ID lists.
            const response = await typedApi.getMediaFilterSelectionStats(wholeFilter.filter, {signal: controller.signal})
            if (current) filesize.value = response.data.filesize
            return
          }
          let total = 0
          for (let offset = 0; offset < ids.length; offset += 5000) {
            const response = await typedApi.getMediaSelectionStats(ids.slice(offset, offset + 5000), {
              signal: controller.signal,
            })
            if (!current) return
            total += response.data.filesize
          }
          filesize.value = total
        } catch (error) {
          if (current) console.warn('Failed calculating selection size', error)
        } finally {
          if (current) loading.value = false
        }
      }, 150)
      onCleanup(() => {
        current = false
        clearTimeout(timer)
        controller.abort()
      })
    },
    {immediate: true, flush: 'sync'},
  )

  return {filesize, loading}
}
