import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useItemsStore } from '@/stores/items'
import { usePlayerStore } from '@/stores/player'
import { useEventBus } from '@/utils/eventBus'
import { getDefaultMediaTypeId } from '@/utils/mediaType'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if ((target as HTMLElement).isContentEditable) return true
  return Boolean(target.closest('[contenteditable="true"]'))
}

function isItemsLibraryRoute(path: string): boolean {
  return path === '/media' || path.startsWith('/media/')
    || path === '/meta' || path.startsWith('/meta/')
}

export function useAppHotkeys() {
  const router = useRouter()
  const appStore = useAppStore()
  const itemsStore = useItemsStore()
  const playerStore = usePlayerStore()
  const eventBus = useEventBus()
  const showShortcuts = ref(false)

  function openAddMedia() {
    const id = itemsStore.environment?.media_type_id
      ?? getDefaultMediaTypeId(appStore.mediaTypes)
    if (router.currentRoute.value.path !== '/media' && id != null) {
      void router.push(`/media?mediaTypeId=${id}`)
    }
    eventBus.emit('showAddMediaDialog')
  }

  function showShortcutsDialog() {
    showShortcuts.value = true
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.defaultPrevented) return
    if (playerStore.active) return
    if (isTypingTarget(event.target)) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (event.repeat) return

    // Use event.code so hotkeys work on non-Latin keyboard layouts.
    if (event.code === 'Slash' && event.shiftKey) {
      event.preventDefault()
      showShortcuts.value = true
      return
    }

    if (event.code === 'KeyA') {
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
      if (!isItemsLibraryRoute(router.currentRoute.value.path)) return
      event.preventDefault()
      itemsStore.isSelect = !itemsStore.isSelect
      if (!itemsStore.isSelect) {
        itemsStore.selection = []
        itemsStore.selected_last = null
      }
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
    eventBus.on('showKeyboardShortcuts', showShortcutsDialog)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown)
    eventBus.off('showKeyboardShortcuts', showShortcutsDialog)
  })

  return {
    showShortcuts,
    openPlayerDocs() {
      showShortcuts.value = false
      eventBus.emit('showDocumentation', 'player.hotkeys')
    },
  }
}
