import {onBeforeUnmount, onMounted} from 'vue'
import {useRouter} from 'vue-router'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import {useItemsStore} from '@/stores/items'
import {usePlayerStore} from '@/stores/player'
import {useSettingsStore} from '@/stores/settings'
import {useContextMenu} from '@/stores/contextMenu'
import {useBrowserLayout, isItemsGridRoute, isInspectorRoute, isFoldersRoute} from '@/composable/useBrowserLayout'
import useItemContextMenu from '@/composable/ItemContextMenu'
import {useFoldersBrowserFocus} from '@/composable/useFoldersBrowserFocus'
import {resolveFoldersHotkey} from '@/utils/foldersHotkeys'
import {setOption} from '@/services/settingsService'
import {findMediaTypeById} from '@/utils/mediaType'
import {resolveOpenMediaKind} from '@/utils/openMediaKind'
import {openTextMedia} from '@/utils/openTextMedia'
import {useEventBus} from '@/utils/eventBus'
import {isBlockingOverlayOpen, isTypingTarget} from '@/utils/keyboardTarget'
import {useReviewModeLauncher} from '@/composable/useReviewModeLauncher'
import type {MediaItem, Meta, Tag} from '@/types/stores'

export type BrowserNavDirection = 'left' | 'right' | 'up' | 'down'

const VISIBLE_GRID_SELECTOR = [
  '.items-page-grid .item[data-item-id]',
  '.items-masonry-grid .item[data-item-id]',
  '.items-page-grid [data-folder-path]',
  '.folders-virtual-grid__cell--media[data-item-id]',
  '.folders-virtual-grid [data-pending-path]',
].join(', ')

/** Deduplicate folder tiles / media cards that share the same id in the DOM. */
export function uniqueVisibleGridElements(nodes: Iterable<HTMLElement>): HTMLElement[] {
  const seen = new Set<string>()
  const result: HTMLElement[] = []
  for (const el of nodes) {
    const folderPath = el.dataset.folderPath
    const pendingPath = el.dataset.pendingPath
    const itemId = el.dataset.itemId
    const key = folderPath
      ? `folder:${folderPath}`
      : pendingPath
        ? `pending:${pendingPath}`
        : itemId
          ? `item:${itemId}`
          : null
    if (key == null || seen.has(key)) continue
    seen.add(key)
    result.push(el)
  }
  return result
}

/** Card roots currently rendered in the items grid / masonry / folders browser. */
export function queryVisibleItemElements(): HTMLElement[] {
  return uniqueVisibleGridElements(
    document.querySelectorAll<HTMLElement>(VISIBLE_GRID_SELECTOR),
  )
}

/** Media cards only — used while bulk-selecting so folder tiles are skipped. */
export function queryVisibleMediaItemElements(): HTMLElement[] {
  return queryVisibleItemElements().filter((el) => {
    const id = Number(el.dataset.itemId)
    return Number.isFinite(id)
  })
}

export function findItemElementById(id: number): HTMLElement | null {
  return document.querySelector(
    `.folders-virtual-grid__cell--media[data-item-id="${id}"], .item[data-item-id="${id}"]`,
  )
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
  const settingsStore = useSettingsStore()
  const dialogsStore = useDialogsStore()
  const playerStore = usePlayerStore()
  const contextMenuStore = useContextMenu()
  const {useBrowserLayout: browserLayoutActive} = useBrowserLayout()
  const {openReviewMode} = useReviewModeLauncher()
  const {focused: foldersFocus, setFocus: setFoldersFocus} = useFoldersBrowserFocus()
  const eventBus = useEventBus()

  function emitFoldersGoUp() {
    eventBus.emit('folders:go-up')
  }

  function emitFoldersOpenPath(folderPath: string) {
    eventBus.emit('folders:open-path', folderPath)
  }

  function emitFoldersOpenTags() {
    eventBus.emit('folders:open-tags')
  }

  function toggleSidebar() {
    const next = settingsStore.sidebarCollapsed === '1' ? '0' : '1'
    void setOption(next, 'sidebarCollapsed')
  }

  function toggleInspector() {
    const next = settingsStore.inspectorCollapsed === '1' ? '0' : '1'
    void setOption(next, 'inspectorCollapsed')
  }

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
    setFoldersFocus({kind: 'media', id})
    itemsStore.focusForInspector(item)
    requestAnimationFrame(() => {
      const el = findItemElementById(id)
      if (el) scrollItemIntoView(el)
    })
  }

  function focusFolderPath(folderPath: string) {
    setFoldersFocus({kind: 'folder', path: folderPath})
    itemsStore.clearInspectorFocus()
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-folder-path="${CSS.escape(folderPath)}"]`,
      )
      if (el) scrollItemIntoView(el)
    })
  }

  function focusPendingPath(pendingPath: string) {
    setFoldersFocus({kind: 'pending', path: pendingPath})
    itemsStore.clearInspectorFocus()
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-pending-path="${CSS.escape(pendingPath)}"]`,
      )
      if (el) scrollItemIntoView(el)
    })
  }

  function applyFocusFromElement(el: HTMLElement) {
    const folderPath = el.dataset.folderPath
    if (folderPath) {
      focusFolderPath(folderPath)
      return true
    }
    const pendingPath = el.dataset.pendingPath
    if (pendingPath) {
      focusPendingPath(pendingPath)
      return true
    }
    const nextId = Number(el.dataset.itemId)
    if (Number.isFinite(nextId)) {
      focusById(nextId)
      return true
    }
    return false
  }

  function focusFirstVisible() {
    // On the folders page, use the visible DOM elements which include both folders and media.
    if (isFoldersRoute(router.currentRoute.value.path)) {
      const visible = queryVisibleItemElements()
      if (visible.length && applyFocusFromElement(visible[0])) return
    }
    const page = itemsStore.itemsOnPage
    if (!page.length) return
    focusById(Number(page[0].id))
  }

  function focusLastVisible() {
    if (isFoldersRoute(router.currentRoute.value.path)) {
      const visible = queryVisibleItemElements()
      if (visible.length && applyFocusFromElement(visible[visible.length - 1])) return
    }
    const page = itemsStore.itemsOnPage
    if (!page.length) return
    focusById(Number(page[page.length - 1].id))
  }

  function moveFocus(direction: BrowserNavDirection) {
    const page = itemsStore.itemsOnPage
    const visible = queryVisibleItemElements()
    if (!page.length && !visible.length) return

    const id = focusedId()
    const folderPath = foldersFocus.value?.kind === 'folder' ? foldersFocus.value.path : null
    const pendingPath = foldersFocus.value?.kind === 'pending' ? foldersFocus.value.path : null
    const currentEl = folderPath
      ? document.querySelector<HTMLElement>(`[data-folder-path="${CSS.escape(folderPath)}"]`)
      : pendingPath
        ? document.querySelector<HTMLElement>(`[data-pending-path="${CSS.escape(pendingPath)}"]`)
        : id != null ? findItemElementById(id) : null

    if (!currentEl) {
      if (visible[0] && applyFocusFromElement(visible[0])) return
      if (page.length) focusFirstVisible()
      return
    }

    const neighbor = findNeighborItemElement(currentEl, direction, visible)
    if (neighbor && applyFocusFromElement(neighbor)) return

    if (!page.length) return
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
      const neighbor = findNeighborItemElement(currentEl, direction, queryVisibleMediaItemElements())
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

  function mediaNeighborFromFolder(direction: BrowserNavDirection): number | null {
    const folderPath = foldersFocus.value?.kind === 'folder' ? foldersFocus.value.path : null
    if (!folderPath) return null
    const folderEl = document.querySelector<HTMLElement>(
      `[data-folder-path="${CSS.escape(folderPath)}"]`,
    )
    if (!folderEl) return null
    const neighbor = findNeighborItemElement(folderEl, direction, queryVisibleMediaItemElements())
    if (!neighbor) return null
    const nextId = Number(neighbor.dataset.itemId)
    return Number.isFinite(nextId) ? nextId : null
  }

  /** Enter select mode and extend a range with Shift+arrows from the focused card. */
  function extendSelection(direction: BrowserNavDirection) {
    const page = itemsStore.itemsOnPage
    if (!page.length) return

    if (foldersFocus.value?.kind === 'folder') {
      const nextId = mediaNeighborFromFolder(direction) ?? Number(page[0].id)
      if (!Number.isFinite(nextId)) return
      itemsStore.isSelect = true
      itemsStore.selection = [nextId]
      itemsStore.selectionAnchor = nextId
      itemsStore.selected_last = nextId
      setFoldersFocus({kind: 'media', id: nextId})
      requestAnimationFrame(() => {
        const el = findItemElementById(nextId)
        if (el) scrollItemIntoView(el)
      })
      return
    }

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
    if (foldersFocus.value?.kind === 'folder') {
      itemsStore.isSelect = true
      return
    }

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
        player: 'default',
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
    if (playerStore.active) return
    if (contextMenuStore.show) return
    if (isBlockingOverlayOpen()) return
    if (isTypingTarget(event.target)) return

    const isArrow = event.code === 'ArrowLeft'
      || event.code === 'ArrowRight'
      || event.code === 'ArrowUp'
      || event.code === 'ArrowDown'
      || event.code === 'KeyJ'
      || event.code === 'KeyK'
      || event.code === 'Home'
      || event.code === 'End'

    // Shift+arrows start / extend a multi-select range from the focused card.
    if (
      isItemsGridRoute(router.currentRoute.value.path)
      && event.shiftKey
      && !event.ctrlKey
      && !event.metaKey
      && !event.altKey
      && isArrow
    ) {
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

    if (isFoldersRoute(router.currentRoute.value.path) && !event.repeat) {
      const foldersAction = resolveFoldersHotkey({
        code: event.code,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        focusedKind: foldersFocus.value?.kind || (focusedId() != null ? 'media' : null),
      })
      const allowFoldersAction = !itemsStore.isSelect
        || foldersAction === 'history-back'
        || foldersAction === 'history-forward'
      if (allowFoldersAction) {
        if (foldersAction === 'history-back') {
          event.preventDefault()
          eventBus.emit('folders:history-back')
          return
        }
        if (foldersAction === 'history-forward') {
          event.preventDefault()
          eventBus.emit('folders:history-forward')
          return
        }
        if (foldersAction === 'go-up') {
          event.preventDefault()
          emitFoldersGoUp()
          return
        }
        if (foldersAction === 'open-tags') {
          event.preventDefault()
          emitFoldersOpenTags()
          return
        }
        if (foldersAction === 'open-folder' && foldersFocus.value?.kind === 'folder') {
          event.preventDefault()
          emitFoldersOpenPath(foldersFocus.value.path)
          return
        }
        if (foldersAction === 'delete-media') {
          if (!focusedId()) return
          event.preventDefault()
          openDelete()
          return
        }
        if (foldersAction === 'edit-media') {
          if (foldersFocus.value?.kind === 'pending') {
            event.preventDefault()
            eventBus.emit('folders:pending-edit', foldersFocus.value.path)
            return
          }
          if (!focusedId()) return
          event.preventDefault()
          openEdit()
          return
        }
        if (foldersAction === 'play-media') {
          if (foldersFocus.value?.kind === 'pending') {
            event.preventDefault()
            eventBus.emit('folders:pending-play', foldersFocus.value.path)
            return
          }
          if (!focusedId()) return
          event.preventDefault()
          playFocused()
          return
        }
      }
    }

    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
    if (event.repeat) return

    // Panel chrome toggles — work even in select mode / without a focused card.
    if (event.code === 'KeyB') {
      event.preventDefault()
      toggleSidebar()
      return
    }
    if (event.code === 'KeyI' && isInspectorRoute(router.currentRoute.value.path)) {
      event.preventDefault()
      toggleInspector()
      return
    }

    if (!isItemsGridRoute(router.currentRoute.value.path)) return

    // While bulk-select is active, ItemsSelection owns keyboard handling.
    if (itemsStore.isSelect) return

    if (!canHandle(event)) return

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
        if (isFoldersRoute(router.currentRoute.value.path) && foldersFocus.value?.kind === 'folder') {
          event.preventDefault()
          emitFoldersOpenPath(foldersFocus.value.path)
          return
        }
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
        if (!focusedId() && foldersFocus.value?.kind !== 'folder') return
        event.preventDefault()
        setFoldersFocus(null)
        itemsStore.clearInspectorFocus()
        return
      case 'Delete':
      case 'Backspace':
        if (isFoldersRoute(router.currentRoute.value.path)) {
          // Handled above via resolveFoldersHotkey.
          return
        }
        if (!focusedId()) return
        event.preventDefault()
        openDelete()
        return
      case 'KeyT':
        if (isFoldersRoute(router.currentRoute.value.path)) {
          event.preventDefault()
          emitFoldersOpenTags()
          return
        }
        event.preventDefault()
        focusTagsSearch()
        return
      case 'KeyR':
        if (itemsStore.type !== 'media') return
        event.preventDefault()
        void openReviewMode()
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
