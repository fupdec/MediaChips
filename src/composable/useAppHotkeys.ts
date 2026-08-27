import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useItemsStore } from '@/stores/items'
import { usePlayerStore } from '@/stores/player'
import { registerAppShellHandler, useAppShell } from '@/composable/appShell'
import { getDefaultMediaTypeId } from '@/utils/mediaType'
import { isBlockingOverlayOpen, isTypingTarget } from '@/utils/keyboardTarget'
import { isFoldersRoute } from '@/composable/useBrowserLayout'
import { useFsBrowseSelection } from '@/stores/fsBrowseSelection'

function isItemsLibraryRoute(path: string): boolean {
  return path === '/media' || path.startsWith('/media/')
    || path === '/meta' || path.startsWith('/meta/')
    || path === '/tag' || path.startsWith('/tag/')
}

export function useAppHotkeys() {
  const router = useRouter()
  const appStore = useAppStore()
  const itemsStore = useItemsStore()
  const playerStore = usePlayerStore()
  const fsSelection = useFsBrowseSelection()
  const appShell = useAppShell()
  const showShortcuts = ref(false)

  function openAddMedia() {
    const id = itemsStore.environment?.media_type_id
      ?? getDefaultMediaTypeId(appStore.mediaTypes)
    if (router.currentRoute.value.path !== '/media' && id != null) {
      void router.push(`/media?mediaTypeId=${id}`)
    }
    appShell.showAddMediaDialog()
  }

  function showShortcutsDialog() {
    showShortcuts.value = true
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.defaultPrevented) return
    if (playerStore.active) return

    // ⌘/Ctrl+K — command palette.
    // In Electron the app menu accelerator owns this shortcut to avoid double-toggle.
    if (
      !window.electronAPI
      && (event.metaKey || event.ctrlKey)
      && !event.altKey
      && !event.shiftKey
      && event.code === 'KeyK'
      && !event.repeat
    ) {
      event.preventDefault()
      appShell.toggleCommandPalette()
      return
    }

    if (isBlockingOverlayOpen()) return
    if (isTypingTarget(event.target)) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (event.repeat) return

    // Use event.code so hotkeys work on non-Latin keyboard layouts.
    if (event.code === 'Slash' && event.shiftKey) {
      event.preventDefault()
      showShortcuts.value = true
      return
    }

    // Add media — only on library pages (never settings / home / chat overlays).
    if (event.code === 'KeyA') {
      if (!isItemsLibraryRoute(router.currentRoute.value.path)) return
      event.preventDefault()
      openAddMedia()
      return
    }

    if (event.code === 'KeyF') {
      if (!isItemsLibraryRoute(router.currentRoute.value.path)) return
      event.preventDefault()
      appStore.filters.visible = !appStore.filters.visible
      return
    }

    if (event.code === 'KeyS') {
      const path = router.currentRoute.value.path
      if (!isItemsLibraryRoute(path) && !isFoldersRoute(path)) return
      // Filesystem browse has its own selection buffer; S is for library media.
      if (isFoldersRoute(path) && fsSelection.isSelectMode) return
      event.preventDefault()
      itemsStore.isSelect = !itemsStore.isSelect
      if (!itemsStore.isSelect) {
        itemsStore.selection = []
        itemsStore.selected_last = null
        itemsStore.selectionAnchor = null
      }
    }
  }

  let unregisterShowKeyboardShortcuts: (() => void) | null = null

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
    unregisterShowKeyboardShortcuts = registerAppShellHandler('showKeyboardShortcuts', showShortcutsDialog)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown)
    unregisterShowKeyboardShortcuts?.()
    unregisterShowKeyboardShortcuts = null
  })

  return {
    showShortcuts,
    openPlayerDocs() {
      showShortcuts.value = false
      appShell.showDocumentation('player.hotkeys')
    },
  }
}
