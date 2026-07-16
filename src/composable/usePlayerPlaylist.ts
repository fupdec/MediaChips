import { computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '@/stores/player'
import { useEventBus } from '@/utils/eventBus'
import {
  createShuffledPlaylistIndexes,
  promotePlaylistIndex,
  shouldSkipShuffleReshuffle,
} from '@/composable/playerPlaylist'
import type { MediaItem } from '@/types/stores'

interface PlaylistPlayPayload {
  n: MediaItem
  o: MediaItem | undefined
}

interface UsePlayerPlaylistOptions {
  emit: (event: 'play', payload: PlaylistPlayPayload) => void
  scrollerId?: string
}

export function usePlayerPlaylist({ emit, scrollerId = 'scroller' }: UsePlayerPlaylistOptions) {
  const playerStore = usePlayerStore()
  const eventBus = useEventBus()
  const { t } = useI18n()

  const player = computed(() => playerStore)

  const video = computed(() => player.value.playlist[player.value.nowPlaying])

  const title = computed(() => t('player.playlist_count', {
    current: player.value.nowPlaying + 1,
    total: player.value.playlist.length,
  }))

  const scrollToNowPlaying = () => {
    setTimeout(() => {
      const scroller = document.getElementById(scrollerId)
      if (!scroller) return

      const item = scroller.children[player.value.nowPlaying]
      if (item) {
        item.scrollIntoView({ block: 'nearest' })
      }
    }, 0)
  }

  const play = (index: number) => {
    playerStore.paused = false
    const current = video.value
    const next = player.value.playlist[index]
    if (!next) return

    playerStore.nowPlaying = index

    if (player.value.playlistMode.includes('shuffle')) {
      playerStore.playlistShuffle = promotePlaylistIndex(
        createShuffledPlaylistIndexes(player.value.playlist.length),
        index,
      )
      emit('play', { n: next, o: current })
      if (player.value.playlistVisible) scrollToNowPlaying()
      return
    }

    emit('play', { n: next, o: current })
  }

  const handleScrollToNowPlaying = () => {
    scrollToNowPlaying()
  }

  watch(() => player.value.playlistMode, (mode, oldMode) => {
    if (shouldSkipShuffleReshuffle(mode, oldMode)) return

    const current = video.value
    playerStore.playlistShuffle = createShuffledPlaylistIndexes(player.value.playlist.length)
    const nextIndex = playerStore.playlistShuffle[0]
    emit('play', { n: player.value.playlist[nextIndex], o: current })
    if (player.value.playlistVisible) scrollToNowPlaying()
  }, { deep: true })

  onMounted(() => {
    eventBus.on('scrollToNowPlaying', handleScrollToNowPlaying)
  })

  onBeforeUnmount(() => {
    eventBus.off('scrollToNowPlaying', handleScrollToNowPlaying)
  })

  return {
    playerStore,
    player,
    title,
    play,
    scrollToNowPlaying,
  }
}
