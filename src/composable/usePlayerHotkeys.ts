import { onBeforeUnmount } from 'vue'
import { handlePlayerKeydown, shouldHandlePlayerShortcut } from '@/utils/playerHotkeys'
import type { usePlayerStore } from '@/stores/player'
import { i18n } from '@/i18n/loadLocale'

type PlayerStore = ReturnType<typeof usePlayerStore>

export interface PlayerHotkeyContext {
  playerStore: PlayerStore
  controls?: import('@/types/player').PlayerControlsRef | null
  togglePause?: () => void
  toggleFullscreen?: () => void
  changeVolume?: (e: WheelEvent | { volume?: number; deltaY?: number }) => void
  openAddingMark?: () => void
  closePlayer?: () => void
}

export function usePlayerHotkeys(getContext: () => PlayerHotkeyContext) {
  let attached = false

  function onKeydown(event: KeyboardEvent) {
    const ctx = getContext()
    if (!shouldHandlePlayerShortcut(event, ctx.playerStore)) return

    if (handlePlayerKeydown(event, { ...ctx, t: (key: string) => String(i18n.global.t(key)) })) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  function attach() {
    if (attached) return
    window.addEventListener('keydown', onKeydown)
    attached = true
  }

  function detach() {
    if (!attached) return
    window.removeEventListener('keydown', onKeydown)
    attached = false
  }

  onBeforeUnmount(detach)

  return { attach, detach }
}
