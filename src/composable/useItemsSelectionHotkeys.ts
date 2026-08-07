import {onBeforeUnmount, onMounted} from 'vue'
import {useItemsStore} from '@/stores/items'
import {usePlayerStore} from '@/stores/player'
import {useContextMenu} from '@/stores/contextMenu'
import {
  findItemElementById,
  findNeighborItemElement,
  queryVisibleItemElements,
  type BrowserNavDirection,
} from '@/composable/useBrowserLayoutHotkeys'
import {isBlockingOverlayOpen, isTypingTarget} from '@/utils/keyboardTarget'

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
  const itemsStore = useItemsStore()
  const playerStore = usePlayerStore()
  const contextMenuStore = useContextMenu()

  function cursorId(): number | null {
    if (itemsStore.selected_last != null) return Number(itemsStore.selected_last)
    if (itemsStore.selection.length) return Number(itemsStore.selection[itemsStore.selection.length - 1])
    return null
  }

  function setCursor(id: number) {
    itemsStore.selected_last = id
    requestAnimationFrame(() => {
      const el = findItemElementById(id)
      if (el) scrollItemIntoView(el)
    })
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
      const neighbor = findNeighborItemElement(currentEl, direction, queryVisibleItemElements())
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
      options?.onSelectVisible?.()
      itemsStore.selectionAnchor = null
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
