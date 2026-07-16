import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { usePlayerStore } from '@/stores/player'
import { useEventBus } from '@/utils/eventBus'
import { subscribeElectronIpc } from '@/utils/electronIpc'
import { isStandalonePlayerRoute } from '@/utils/playerWindow'
import type { MediaItem } from '@/types/stores'
import type { PlayVideoPayload } from '@/services/electronBridge'
import type {
  PlayerWindowBridgeAttachOptions,
  UsePlayerWindowBridgeOptions,
} from '@/types/player'

export function usePlayerWindowBridge({
  onInvalidPlayData,
}: UsePlayerWindowBridgeOptions = {}) {
  const route = useRoute()
  const appStore = useAppStore()
  const playerStore = usePlayerStore()
  const eventBus = useEventBus()

  const isPlayerWindow = computed(() => isStandalonePlayerRoute(route))

  const buildPlayerWindowTitle = (item: MediaItem | null | undefined) => {
    const base = appStore.app_title || 'MediaChips'
    const fileName = item?.basename || item?.name
    return fileName ? `${base} - ${fileName}` : base
  }

  const updatePlayerWindowTitle = (item: MediaItem) => {
    if (!isPlayerWindow.value) return
    const title = buildPlayerWindowTitle(item)
    playerStore.mediaWindowTitle = title
    document.title = title
  }

  const resetPlayerWindowTitle = () => {
    if (!isPlayerWindow.value) return
    playerStore.mediaWindowTitle = ''
    document.title = appStore.app_title || 'MediaChips'
  }

  const updateItemVideo = (
    id: number | string,
    patch?: Record<string, unknown>,
  ) => {
    const data = {
      ids: [id],
      type: 'media',
      ...(patch ? {patch} : {}),
    }

    if (isPlayerWindow.value && window.electronAPI?.send) {
      window.electronAPI.send('getItemsFromDb', data)
    } else {
      eventBus.emit('getItemsFromDb', data)
    }
  }

  const exitElectronFullscreenIfNeeded = () => {
    const isMacos = navigator.platform.indexOf('Mac') > -1
    if (window.os && isMacos && window.electronAPI?.send) {
      window.electronAPI.send('setFullScreen', false)
    }
  }

  let cleanups: Array<() => void> = []

  const detach = () => {
    cleanups.forEach((cleanup) => cleanup())
    cleanups = []
  }

  const attach = ({ onPlayVideo, onStopPlaying }: PlayerWindowBridgeAttachOptions) => {
    detach()

    if (window.electronAPI?.on) {
      const handlePlayVideo = (...args: unknown[]) => {
        const data = args[1] as PlayVideoPayload | undefined
        if (data?.video) {
          onPlayVideo(data.video as MediaItem, (data.videos ?? []) as MediaItem[], data.time)
          return
        }
        onInvalidPlayData?.()
      }

      const handleStopPlaying = () => {
        onStopPlaying()
      }

      cleanups.push(subscribeElectronIpc('play-video', handlePlayVideo))
      cleanups.push(subscribeElectronIpc('stop-playing-video', handleStopPlaying))
    }
  }

  return {
    isPlayerWindow,
    updateItemVideo,
    updatePlayerWindowTitle,
    resetPlayerWindowTitle,
    exitElectronFullscreenIfNeeded,
    attach,
    detach,
  }
}
