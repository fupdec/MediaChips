import { useRouter } from 'vue-router'
import { useItemsStore } from '@/stores/items'
import { useItemsPageCommands } from '@/composable/itemsPageCommands'
import { getDefaultMediaTypeId } from '@/utils/mediaType'
import { useAppStore } from '@/stores/app'

interface OpenMediaListOptions {
  sortBy?: string
  sortDir?: string
  mediaTypeId?: number
}

export function useOpenMediaList() {
  const router = useRouter()
  const itemsStore = useItemsStore()
  const appStore = useAppStore()
  const pageCommands = useItemsPageCommands()

  const openMediaList = async ({ sortBy, sortDir = 'desc', mediaTypeId }: OpenMediaListOptions = {}) => {
    const targetMediaTypeId = mediaTypeId ?? getDefaultMediaTypeId(appStore.mediaTypes)

    await router.push(`/media?mediaTypeId=${targetMediaTypeId}`)

    if (sortBy) {
      itemsStore.updateState({ key: 'sortBy', value: sortBy })
      itemsStore.updateState({ key: 'sortDir', value: sortDir })
      pageCommands.setSortBy(sortBy)
      pageCommands.setSortDir(sortDir)
    }
  }

  return { openMediaList }
}
