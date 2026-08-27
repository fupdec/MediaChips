import useItemContextMenu, {type ItemContextMenuOptions} from '@/composable/ItemContextMenu'
import {useContextMenu} from '@/stores/contextMenu'
import type {ContextMenuEntry, Meta} from '@/types/stores'
import type {PageItem} from '@/utils/pageItem'

/**
 * Opens the library item context menu for a single card (home widgets, search).
 * Safe to call from event handlers — same pattern as Item.vue / GlobalSearch.
 */
export function openItemContextMenu(
  event: MouseEvent,
  item: PageItem,
  type: 'media' | 'tag',
  meta: Meta | null | undefined = null,
  isFileExists = true,
  options: ItemContextMenuOptions = {},
) {
  event.preventDefault()
  event.stopPropagation()

  const {getContextMenu} = useItemContextMenu(
    item,
    type,
    meta,
    isFileExists,
    null,
    {singleItem: true, ...options},
  )

  useContextMenu().showContextMenu({
    content: getContextMenu() as ContextMenuEntry[],
    x: event.clientX,
    y: event.clientY,
    tagMeta: meta,
    targetItemId: Number(item.id) || null,
  })
}
