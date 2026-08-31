import {onBeforeUnmount, onMounted} from 'vue'
import {useRouter} from 'vue-router'
import {useItemsStore} from '@/stores/items'
import {usePlayerStore} from '@/stores/player'
import {useContextMenu} from '@/stores/contextMenu'
import {useFsBrowseSelection} from '@/stores/fsBrowseSelection'
import {isFoldersRoute} from '@/composable/useBrowserLayout'
import {
  applyMixedGridRange,
  clearMixedGridAnchor,
  cursorFromGridElement,
  findGridElement,
  findItemElementById,
  findNeighborItemElement,
  pathBasename,
  queryVisibleItemElements,
  queryVisibleMediaItemElements,
  type BrowserNavDirection,
  type GridNavCursor,
} from '@/composable/useBrowserLayoutHotkeys'
import {isBlockingOverlayOpen, isTypingTarget} from '@/utils/keyboardTarget'
import {useFoldersBrowserFocus} from '@/composable/useFoldersBrowserFocus'

function scrollItemIntoView(el: HTMLElement) {
  el.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'smooth'})
}

/**
 * Keyboard selection while bulk-select mode is active:
 * arrows / J K move the cursor, Space toggles, Shift+arrows select a range,
 * Ctrl/Cmd+A selects the visible page.
 */
export function useItemsSelectionHotkeys(options?: {
  onExitSelect?: () => void
  onBulkEdit?: () => void
  onDelete?: () => void
  onSelectVisible?: () => void
}) {
  const router = useRouter()
  const itemsStore = useItemsStore()
  const playerStore = usePlayerStore()
  const contextMenuStore = useContextMenu()
  const fsSelection = useFsBrowseSelection()
  const {focused: foldersFocus, setFocus: setFoldersFocus} = useFoldersBrowserFocus()

  function onFoldersPage() {
    return isFoldersRoute(router.currentRoute.value.path)
  }

  function cursorId(): number | null {
    if (itemsStore.selected_last != null) return Number(itemsStore.selected_last)
    if (itemsStore.selection.length) return Number(itemsStore.selection[itemsStore.selection.length - 1])
    return null
  }

  function setCursor(id: number) {
    itemsStore.selected_last = id
    setFoldersFocus({kind: 'media', id})
    requestAnimationFrame(() => {
      const el = findItemElementById(id)
      if (el) scrollItemIntoView(el)
    })
  }

  function currentGridCursor(): GridNavCursor | null {
    if (foldersFocus.value?.kind === 'folder') {
      return {kind: 'folder', path: foldersFocus.value.path}
    }
    if (foldersFocus.value?.kind === 'pending') {
      return {kind: 'pending', path: foldersFocus.value.path}
    }
    if (foldersFocus.value?.kind === 'media') {
      return {kind: 'media', id: foldersFocus.value.id}
    }
    const id = cursorId()
    if (id != null) return {kind: 'media', id}
    return null
  }

  function setGridCursor(cursor: GridNavCursor) {
    if (cursor.kind === 'media') {
      itemsStore.selected_last = cursor.id
      setFoldersFocus({kind: 'media', id: cursor.id})
    } else {
      itemsStore.selected_last = null
      setFoldersFocus(
        cursor.kind === 'folder'
          ? {kind: 'folder', path: cursor.path}
          : {kind: 'pending', path: cursor.path},
      )
    }
    requestAnimationFrame(() => {
      const el = findGridElement(cursor)
      if (el) scrollItemIntoView(el)
    })
  }

  function ensureGridCursor(): GridNavCursor | null {
    const existing = currentGridCursor()
    if (existing && findGridElement(existing)) return existing
    const first = queryVisibleItemElements()[0]
    if (!first) return null
    const cursor = cursorFromGridElement(first)
    if (cursor) setGridCursor(cursor)
    return cursor
  }

  function toggleFsCursor(cursor: Extract<GridNavCursor, {kind: 'folder' | 'pending'}>) {
    const name = pathBasename(cursor.path)
    if (cursor.kind === 'folder') {
      fsSelection.toggleFolder({path: cursor.path, name, mediaCount: 0})
      return
    }
    fsSelection.toggleFsFile({
      path: cursor.path,
      name,
      isDirectory: false,
      size: null,
      mtimeMs: null,
      extension: null,
      inLibrary: false,
      addable: true,
      mediaId: null,
    })
  }

  function moveFoldersCursor(direction: BrowserNavDirection, extend: boolean) {
    const visible = queryVisibleItemElements()
    if (!visible.length) return
    const current = ensureGridCursor()
    if (!current) return
    const currentEl = findGridElement(current)
    if (!currentEl) return
    const neighbor = findNeighborItemElement(currentEl, direction, visible)
    if (!neighbor) return
    const next = cursorFromGridElement(neighbor)
    if (!next) return

    if (extend) {
      applyMixedGridRange(currentEl, neighbor, visible)
    } else {
      clearMixedGridAnchor()
      itemsStore.selectionAnchor = null
    }
    setGridCursor(next)
  }

  function jumpFoldersCursor(to: 'first' | 'last', extend: boolean) {
    const visible = queryVisibleItemElements()
    if (!visible.length) return
    const current = ensureGridCursor()
    const targetEl = to === 'first' ? visible[0] : visible[visible.length - 1]
    const next = cursorFromGridElement(targetEl)
    if (!next) return
    if (extend && current) {
      const currentEl = findGridElement(current)
      if (currentEl) applyMixedGridRange(currentEl, targetEl, visible)
    } else {
      clearMixedGridAnchor()
      itemsStore.selectionAnchor = null
    }
    setGridCursor(next)
  }

  function toggleFoldersCursorSelection() {
    const cursor = ensureGridCursor()
    if (!cursor) return
    if (cursor.kind === 'media') {
      itemsStore.selectionAnchor = cursor.id
      itemsStore.toggleSelect(null, {id: cursor.id})
      itemsStore.selected_last = cursor.id
      return
    }
    toggleFsCursor(cursor)
  }

  function ensureCursor(): number | null {
    const existing = cursorId()
    if (existing != null) {
      const stillVisible = itemsStore.itemsOnPage.some((item) => Number(item.id) === existing)
      if (stillVisible) return existing
    }
    const first = itemsStore.itemsOnPage[0]
    if (!first) return null
    setCursor(Number(first.id))
    return Number(first.id)
  }

  function selectRange(fromId: number, toId: number) {
    const page = itemsStore.itemsOnPage
    const fromIndex = page.findIndex((item) => Number(item.id) === fromId)
    const toIndex = page.findIndex((item) => Number(item.id) === toId)
    if (fromIndex < 0 || toIndex < 0) {
      itemsStore.selection = [toId]
      return
    }
    const start = Math.min(fromIndex, toIndex)
    const end = Math.max(fromIndex, toIndex)
    itemsStore.selection = page.slice(start, end + 1).map((item) => item.id)
  }

  function resolveNeighborId(fromId: number, direction: BrowserNavDirection): number | null {
    const currentEl = findItemElementById(fromId)
    if (currentEl) {
      const neighbor = findNeighborItemElement(currentEl, direction, queryVisibleMediaItemElements())
      if (neighbor) {
        const nextId = Number(neighbor.dataset.itemId)
        if (Number.isFinite(nextId)) return nextId
      }
    }

    const page = itemsStore.itemsOnPage
    const index = page.findIndex((item) => Number(item.id) === fromId)
    if (index < 0) return page[0] ? Number(page[0].id) : null
    const delta = direction === 'left' || direction === 'up' ? -1 : 1
    const next = page[index + delta]
    return next ? Number(next.id) : null
  }

  function moveCursor(direction: BrowserNavDirection, extend: boolean) {
    if (onFoldersPage()) {
      moveFoldersCursor(direction, extend)
      return
    }
    const page = itemsStore.itemsOnPage
    if (!page.length) return

    const current = ensureCursor()
    if (current == null) return

    const nextId = resolveNeighborId(current, direction)
    if (nextId == null) return

    if (extend) {
      if (itemsStore.selectionAnchor == null) itemsStore.selectionAnchor = current
      selectRange(Number(itemsStore.selectionAnchor), nextId)
    } else {
      itemsStore.selectionAnchor = null
    }

    setCursor(nextId)
  }

  function jumpCursor(to: 'first' | 'last', extend: boolean) {
    if (onFoldersPage()) {
      jumpFoldersCursor(to, extend)
      return
    }
    const page = itemsStore.itemsOnPage
    if (!page.length) return
    const nextId = Number((to === 'first' ? page[0] : page[page.length - 1]).id)
    const current = ensureCursor()

    if (extend) {
      if (itemsStore.selectionAnchor == null) itemsStore.selectionAnchor = current ?? nextId
      selectRange(Number(itemsStore.selectionAnchor), nextId)
    } else {
      itemsStore.selectionAnchor = null
    }

    setCursor(nextId)
  }

  function toggleCursorSelection() {
    if (onFoldersPage()) {
      toggleFoldersCursorSelection()
      return
    }
    const id = ensureCursor()
    if (id == null) return
    itemsStore.selectionAnchor = id
    itemsStore.toggleSelect(null, {id})
    // Keep cursor on the toggled item even if it was removed from selection.
    itemsStore.selected_last = id
  }

  function canHandle(event: KeyboardEvent): boolean {
    if (event.defaultPrevented) return false
    if (!itemsStore.isSelect) return false
    if (playerStore.active) return false
    if (contextMenuStore.show) return false
    if (isBlockingOverlayOpen()) return false
    if (isTypingTarget(event.target)) return false
    return true
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!canHandle(event)) return

    const extend = event.shiftKey
    const withMod = event.ctrlKey || event.metaKey

    if (withMod && !event.altKey && event.code === 'KeyA') {
      event.preventDefault()
      if (onFoldersPage()) {
        const visible = queryVisibleItemElements()
        if (visible.length) {
          applyMixedGridRange(visible[0], visible[visible.length - 1], visible)
        }
      } else {
        options?.onSelectVisible?.()
      }
      itemsStore.selectionAnchor = null
      clearMixedGridAnchor()
      return
    }

    // Modifiers other than Shift are reserved (except Ctrl/Cmd+A above).
    if (event.ctrlKey || event.metaKey || event.altKey) return

    switch (event.code) {
      case 'ArrowLeft':
        event.preventDefault()
        moveCursor('left', extend)
        return
      case 'ArrowRight':
        event.preventDefault()
        moveCursor('right', extend)
        return
      case 'ArrowUp':
      case 'KeyK':
        event.preventDefault()
        moveCursor('up', extend)
        return
      case 'ArrowDown':
      case 'KeyJ':
        event.preventDefault()
        moveCursor('down', extend)
        return
      case 'Home':
        event.preventDefault()
        jumpCursor('first', extend)
        return
      case 'End':
        event.preventDefault()
        jumpCursor('last', extend)
        return
      case 'Space':
        event.preventDefault()
        toggleCursorSelection()
        return
      case 'Escape':
        event.preventDefault()
        clearMixedGridAnchor()
        options?.onExitSelect?.()
        return
      case 'KeyE':
        if (!itemsStore.selection.length) return
        event.preventDefault()
        options?.onBulkEdit?.()
        return
      case 'Delete':
      case 'Backspace':
        if (!itemsStore.selection.length) return
        event.preventDefault()
        options?.onDelete?.()
        return
      default:
        break
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown)
  })
}
