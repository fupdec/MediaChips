import {onBeforeUnmount, onMounted} from 'vue'
import {useRouter} from 'vue-router'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import {useItemsStore} from '@/stores/items'
import {usePlayerStore} from '@/stores/player'
import {useContextMenu} from '@/stores/contextMenu'
import {useBrowserLayout, isItemsGridRoute} from '@/composable/useBrowserLayout'
import useItemContextMenu from '@/composable/ItemContextMenu'
import {findMediaTypeById} from '@/utils/mediaType'
import {resolveOpenMediaKind} from '@/utils/openMediaKind'
import {openTextMedia} from '@/utils/openTextMedia'
import {isBlockingOverlayOpen, isTypingTarget} from '@/utils/keyboardTarget'
import type {MediaItem, Meta, Tag} from '@/types/stores'

export type BrowserNavDirection = 'left' | 'right' | 'up' | 'down'

/** Card roots currently rendered in the items grid / masonry. */
export function queryVisibleItemElements(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      '.items-page-grid .item[data-item-id], .items-masonry-grid .item[data-item-id]',
    ),
  )
}

export function findItemElementById(id: number): HTMLElement | null {
  return document.querySelector(`.item[data-item-id="${id}"]`)
}

/**
 * Pick the nearest card in a direction using on-screen geometry
 * (works for CSS grid, masonry, and grouped sections).
 */
export function findNeighborItemElement(
  current: HTMLElement,
  direction: BrowserNavDirection,
  candidates: HTMLElement[] = queryVisibleItemElements(),
): HTMLElement | null {
  const cur = current.getBoundingClientRect()
  const cx = cur.left + cur.width / 2
  const cy = cur.top + cur.height / 2
  const threshold = 8

  let best: HTMLElement | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (const el of candidates) {
    if (el === current) continue
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) continue

    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const dx = x - cx
    const dy = y - cy

    if (direction === 'left' && dx >= -threshold) continue
    if (direction === 'right' && dx <= threshold) continue
    if (direction === 'up' && dy >= -threshold) continue
    if (direction === 'down' && dy <= threshold) continue

    const primary = direction === 'left' || direction === 'right'
      ? Math.abs(dx)
      : Math.abs(dy)
    const orthogonal = direction === 'left' || direction === 'right'
      ? Math.abs(dy)
      : Math.abs(dx)

    // Prefer items roughly aligned on the orthogonal axis.
    const score = primary + orthogonal * 2.5
    if (score < bestScore) {
      bestScore = score
      best = el
    }
  }

  return best
}

function scrollItemIntoView(el: HTMLElement) {
  el.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'smooth'})
}

export function useBrowserLayoutHotkeys() {
  const router = useRouter()
  const appStore = useAppStore()
  const itemsStore = useItemsStore()
  const dialogsStore = useDialogsStore()
  const playerStore = usePlayerStore()
  const contextMenuStore = useContextMenu()
  const {useBrowserLayout: browserLayoutActive} = useBrowserLayout()

  function focusedId(): number | null {
    if (itemsStore.selected_last != null) return Number(itemsStore.selected_last)
    if (itemsStore.selection.length) return Number(itemsStore.selection[0])
    return null
  }

  function focusedEntity(): MediaItem | Tag | null {
    const id = focusedId()
    if (id == null) return null
    return (itemsStore.entities.find((item) => Number(item.id) === id) as MediaItem | Tag | undefined) ?? null
  }

  function resolveMetaForFocused(item: MediaItem | Tag): Meta | null {
    if (itemsStore.type !== 'tag') return null
    const metaId = Number((item as Tag).metaId ?? itemsStore.environment?.meta_id)
    if (!Number.isFinite(metaId) || metaId <= 0) return null
    return appStore.getMetaById(metaId) ?? null
  }

  function focusById(id: number) {
    const item = itemsStore.entities.find((entry) => Number(entry.id) === id)
      ?? itemsStore.itemsOnPage.find((entry) => Number(entry.id) === id)
    if (!item) return
    itemsStore.focusForInspector(item)
    requestAnimationFrame(() => {
      const el = findItemElementById(id)
      if (el) scrollItemIntoView(el)
    })
  }

  function focusFirstVisible() {
    const page = itemsStore.itemsOnPage
    if (!page.length) return
    focusById(Number(page[0].id))
  }

  function focusLastVisible() {
    const page = itemsStore.itemsOnPage
    if (!page.length) return
    focusById(Number(page[page.length - 1].id))
  }

  function moveFocus(direction: BrowserNavDirection) {
    const page = itemsStore.itemsOnPage
    if (!page.length) return

    const id = focusedId()
    if (id == null) {
      focusFirstVisible()
      return
    }

    const currentEl = findItemElementById(id)
    if (currentEl) {
      const neighbor = findNeighborItemElement(currentEl, direction)
      if (neighbor) {
        const nextId = Number(neighbor.dataset.itemId)
        if (Number.isFinite(nextId)) {
          focusById(nextId)
          return
        }
      }
    }

    // Fallback: flat list order when geometry fails (e.g. item not mounted).
    const index = page.findIndex((item) => Number(item.id) === id)
    if (index < 0) {
      focusFirstVisible()
      return
    }
    const delta = direction === 'left' || direction === 'up' ? -1 : 1
    const next = page[index + delta]
    if (next) focusById(Number(next.id))
  }

  function selectRangeOnPage(fromId: number, toId: number) {
    const page = itemsStore.itemsOnPage
    const fromIndex = page.findIndex((item) => Number(item.id) === fromId)
    const toIndex = page.findIndex((item) => Number(item.id) === toId)
    if (fromIndex < 0 || toIndex < 0) {
      itemsStore.selection = [toId]
      itemsStore.selected_last = toId
      return
    }
    const start = Math.min(fromIndex, toIndex)
    const end = Math.max(fromIndex, toIndex)
    itemsStore.selection = page.slice(start, end + 1).map((item) => item.id)
    itemsStore.selected_last = toId
  }

  function resolveNeighborId(fromId: number, direction: BrowserNavDirection): number | null {
    const currentEl = findItemElementById(fromId)
    if (currentEl) {
      const neighbor = findNeighborItemElement(currentEl, direction)
      if (neighbor) {
        const nextId = Number(neighbor.dataset.itemId)
        if (Number.isFinite(nextId)) return nextId
      }
    }
    const page = itemsStore.itemsOnPage
    const index = page.findIndex((item) => Number(item.id) === fromId)
    if (index < 0) return null
    const delta = direction === 'left' || direction === 'up' ? -1 : 1
    const next = page[index + delta]
    return next ? Number(next.id) : null
  }

  /** Enter select mode and extend a range with Shift+arrows from the focused card. */
  function extendSelection(direction: BrowserNavDirection) {
    const page = itemsStore.itemsOnPage
    if (!page.length) return

    let current = focusedId()
    if (current == null) {
      current = Number(page[0].id)
      itemsStore.selectionAnchor = current
      itemsStore.isSelect = true
      itemsStore.selection = [current]
      itemsStore.selected_last = current
      return
    }

    if (!itemsStore.isSelect) {
      itemsStore.isSelect = true
      if (!itemsStore.selection.includes(current)) {
        itemsStore.selection = [current]
      }
      itemsStore.selectionAnchor = current
    } else if (itemsStore.selectionAnchor == null) {
      itemsStore.selectionAnchor = current
    }

    const nextId = resolveNeighborId(current, direction)
    if (nextId == null) return
    selectRangeOnPage(Number(itemsStore.selectionAnchor), nextId)
    requestAnimationFrame(() => {
      const el = findItemElementById(nextId)
      if (el) scrollItemIntoView(el)
    })
  }

  function toggleFocusedSelection() {
    const page = itemsStore.itemsOnPage
    let id = focusedId()
    if (id == null) {
      if (!page.length) return
      id = Number(page[0].id)
    }

    if (!itemsStore.isSelect) {
      itemsStore.isSelect = true
      itemsStore.selection = [id]
      itemsStore.selected_last = id
      itemsStore.selectionAnchor = id
      requestAnimationFrame(() => {
        const el = findItemElementById(id!)
        if (el) scrollItemIntoView(el)
      })
      return
    }

    itemsStore.toggleSelect(null, {id})
    itemsStore.selected_last = id
    itemsStore.selectionAnchor = id
  }

  function openEdit() {
    const item = focusedEntity()
    if (!item) return
    if (itemsStore.type === 'media') {
      const mediaTypeId = itemsStore.environment?.media_type_id
      const mediaType = mediaTypeId != null
        ? appStore.mediaTypes.find((entry) => Number(entry.id) === Number(mediaTypeId))
        : undefined
      dialogsStore.editMedia(item as MediaItem, mediaType ?? undefined)
      return
    }
    const meta = resolveMetaForFocused(item)
    if (meta) dialogsStore.editTag(item as Tag, meta)
  }

  function openDelete() {
    const item = focusedEntity()
    if (!item) return
    const meta = resolveMetaForFocused(item)
    const {deleteItem} = useItemContextMenu(
      item,
      itemsStore.type,
      meta,
      true,
      null,
    )
    deleteItem()
  }

  function playFocused() {
    const item = focusedEntity()
    if (!item || itemsStore.type !== 'media') return
    const media = item as MediaItem
    const mediaType = findMediaTypeById(
      appStore.mediaTypes,
      itemsStore.environment?.media_type_id ?? media.mediaTypeId,
    )
    const kind = resolveOpenMediaKind(mediaType, {
      missingAsPlay: true,
      path: media.path,
    })

    if (kind === 'view-image') {
      itemsStore.viewImage({image: media})
      return
    }

    if (kind === 'preview-text' || kind === 'open-path') {
      openTextMedia(media)
      return
    }

    if (kind === 'play-av') {
      void itemsStore.playVideo({
        video: media,
        player: 'builtin',
      })
    }
  }

  function focusTagsSearch() {
    const input = document.querySelector(
      '.sidebar-tags-browser__search input',
    ) as HTMLInputElement | null
    if (!input) return
    input.focus()
    input.select()
  }

  function canHandle(event: KeyboardEvent): boolean {
    if (event.defaultPrevented) return false
    if (!browserLayoutActive.value) return false
    if (!isItemsGridRoute(router.currentRoute.value.path)) return false
    if (itemsStore.isSelect) return false
    if (playerStore.active) return false
    if (contextMenuStore.show) return false
    if (isBlockingOverlayOpen()) return false
    if (isTypingTarget(event.target)) return false
    return true
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!browserLayoutActive.value) return
    if (!isItemsGridRoute(router.currentRoute.value.path)) return
    if (playerStore.active) return
    if (contextMenuStore.show) return
    if (isBlockingOverlayOpen()) return
    if (isTypingTarget(event.target)) return

    // While bulk-select is active, ItemsSelection owns keyboard handling.
    if (itemsStore.isSelect) return

    const isArrow = event.code === 'ArrowLeft'
      || event.code === 'ArrowRight'
      || event.code === 'ArrowUp'
      || event.code === 'ArrowDown'
      || event.code === 'KeyJ'
      || event.code === 'KeyK'
      || event.code === 'Home'
      || event.code === 'End'

    // Shift+arrows start / extend a multi-select range from the focused card.
    if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && isArrow) {
      event.preventDefault()
      if (event.code === 'Home') {
        const page = itemsStore.itemsOnPage
        if (!page.length) return
        const current = focusedId() ?? Number(page[0].id)
        if (!itemsStore.isSelect) {
          itemsStore.isSelect = true
          itemsStore.selection = [current]
        }
        if (itemsStore.selectionAnchor == null) itemsStore.selectionAnchor = current
        selectRangeOnPage(Number(itemsStore.selectionAnchor), Number(page[0].id))
        return
      }
      if (event.code === 'End') {
        const page = itemsStore.itemsOnPage
        if (!page.length) return
        const current = focusedId() ?? Number(page[0].id)
        if (!itemsStore.isSelect) {
          itemsStore.isSelect = true
          itemsStore.selection = [current]
        }
        if (itemsStore.selectionAnchor == null) itemsStore.selectionAnchor = current
        selectRangeOnPage(Number(itemsStore.selectionAnchor), Number(page[page.length - 1].id))
        return
      }
      const direction: BrowserNavDirection =
        event.code === 'ArrowLeft' ? 'left'
          : event.code === 'ArrowRight' ? 'right'
            : event.code === 'ArrowUp' || event.code === 'KeyK' ? 'up'
              : 'down'
      extendSelection(direction)
      return
    }

    if (!canHandle(event)) return
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return

    switch (event.code) {
      case 'ArrowLeft':
        event.preventDefault()
        moveFocus('left')
        return
      case 'ArrowRight':
        event.preventDefault()
        moveFocus('right')
        return
      case 'ArrowUp':
      case 'KeyK':
        event.preventDefault()
        moveFocus('up')
        return
      case 'ArrowDown':
      case 'KeyJ':
        event.preventDefault()
        moveFocus('down')
        return
      case 'Home':
        event.preventDefault()
        focusFirstVisible()
        return
      case 'End':
        event.preventDefault()
        focusLastVisible()
        return
      case 'Enter':
      case 'KeyE':
        if (!focusedId()) return
        event.preventDefault()
        openEdit()
        return
      case 'Space':
        if (!focusedId() || itemsStore.type !== 'media') return
        event.preventDefault()
        playFocused()
        return
      case 'KeyX':
        event.preventDefault()
        toggleFocusedSelection()
        return
      case 'Escape':
        if (!focusedId()) return
        event.preventDefault()
        itemsStore.clearInspectorFocus()
        return
      case 'Delete':
      case 'Backspace':
        if (!focusedId()) return
        event.preventDefault()
        openDelete()
        return
      case 'KeyT':
        event.preventDefault()
        focusTagsSearch()
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
