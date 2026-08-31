import {useItemsStore} from '@/stores/items'
import {typedApi} from '@/services/typedApi'
import {serializeGroupBySetting} from '@/utils/itemsGroupBy'

function toId(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Snapshot the current list layout onto a newly created tab's pageSettings row. */
export async function copyCurrentPageSettingsToTab(tabId: number): Promise<void> {
  const id = Number(tabId)
  if (!Number.isFinite(id) || id <= 0) return

  const itemsStore = useItemsStore()
  const env = itemsStore.environment

  await typedApi.savePageSetting({
    tabId: id,
    mediaTypeId: toId(env.media_type_id),
    tagId: toId(env.tag_id),
    metaId: toId(env.meta_id),
    size: Number(itemsStore.size) || 3,
    view: itemsStore.view,
    limit: Number(itemsStore.limit) || 101,
    sortBy: String(itemsStore.sortBy || 'name'),
    sortDir: String(itemsStore.sortDir || 'asc'),
    firstChar: serializeGroupBySetting(
      itemsStore.groupBy,
      itemsStore.groupByMetaId,
    ),
    page: 1,
  })
}
