import {useFoldersBrowserFocus} from '@/composable/useFoldersBrowserFocus'
import {useItemsStore} from '@/stores/items'
import {useFsBrowseSelection, type SelectedFsEntry, type MixedGridEntry} from '@/stores/fsBrowseSelection'
import {replacePageSelection} from '@/utils/itemsSelectionRange'

export type MixedGridCursor =
  | {kind: 'media'; id: number}
  | {kind: 'folder'; path: string}
  | {kind: 'pending'; path: string}
export type {MixedGridEntry} from '@/stores/fsBrowseSelection'

let anchor: MixedGridCursor | null = null
export function clearMixedSelectionAnchor() { anchor = null }
function key(entry: MixedGridEntry | MixedGridCursor) {
  return entry.kind === 'media' ? `media:${entry.id}`
    : `${entry.kind === 'folder' ? 'folder' : 'file'}:${entry.path}`
}

function applyEntries(entries: MixedGridEntry[], additive: boolean) {
  const items = useItemsStore()
  const fs = useFsBrowseSelection()
  const media = entries.filter((entry): entry is Extract<MixedGridEntry, {kind: 'media'}> => entry.kind === 'media')
  items.selectionRevision++
  items.isSelect = true
  items.selection = additive
    ? [...new Set([...items.selection, ...media.map(entry => entry.id)])]
    : replacePageSelection(items.selection, fs.gridEntries.filter((entry): entry is Extract<MixedGridEntry, {kind: 'media'}> => entry.kind === 'media'), media.map(entry => entry.id))
  const fsEntries = entries.filter((entry): entry is SelectedFsEntry => entry.kind !== 'media')
  const pageKeys = new Set(fs.gridEntries.map(key))
  fs.setSelectedEntries([
    ...fs.selectedEntries.filter(entry => additive || !pageKeys.has(key(entry))),
    ...fsEntries,
  ])
}

export function selectAllMixedGridEntries() {
  const fs = useFsBrowseSelection()
  applyEntries(fs.gridEntries, true)
  useItemsStore().resetSelectionAnchor()
  clearMixedSelectionAnchor()
}

export function extendMixedGridSelection(from: MixedGridCursor, to: MixedGridCursor, additive = false) {
  const entries = useFsBrowseSelection().gridEntries
  if (!anchor || !entries.some(entry => key(entry) === key(anchor!))) anchor = from
  let start = entries.findIndex(entry => key(entry) === key(anchor!))
  const end = entries.findIndex(entry => key(entry) === key(to))
  if (end < 0) return
  if (start < 0) { start = end; anchor = to }
  applyEntries(entries.slice(Math.min(start, end), Math.max(start, end) + 1), additive)
  useFoldersBrowserFocus().setFocus(to)
  if (to.kind === 'media') useItemsStore().selected_last = to.id
}

export function toggleMixedGridSelection(cursor: MixedGridCursor, event?: MouseEvent | null) {
  const items = useItemsStore()
  if (event?.shiftKey) {
    extendMixedGridSelection(anchor ?? cursor, cursor, event.ctrlKey || event.metaKey)
  } else {
    anchor = cursor
    if (cursor.kind === 'media') items.toggleSelect(null, {id: cursor.id})
    else {
      const entry = useFsBrowseSelection().gridEntries.find(entry => key(entry) === key(cursor))
      if (!entry || entry.kind === 'media') return
      items.isSelect = true
      items.selectionRevision++
      useFsBrowseSelection().toggleSelected(entry)
    }
  }
  if (cursor.kind === 'media') items.selected_last = cursor.id
  useFoldersBrowserFocus().setFocus(cursor)
}
