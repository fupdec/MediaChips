import { computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
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
  scrollToIndex?: (index: number) => void
}

export function usePlayerPlaylist({ emit, scrollToIndex }: UsePlayerPlaylistOptions) {
  const playerStore = usePlayerStore()
  const eventBus = useEventBus()
  const { t } = useI18n()

  const player = computed(() => playerStore)

  const video = computed(() => player.value.playlist[player.value.nowPlaying])

  const title = computed(() => t('player.playlist_count', {
    current: player.value.nowPlaying + 1,
    total: player.value.playlist.length,
  }))

  const scrollToNowPlaying = async () => {
    if (!player.value.playlistVisible) return
    await nextTick()
    requestAnimationFrame(() => {
      scrollToIndex?.(playerStore.nowPlaying)
    })
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
      void scrollToNowPlaying()
      return
    }

    emit('play', { n: next, o: current })
  }

  watch(() => player.value.playlistMode, (mode, oldMode) => {
    if (shouldSkipShuffleReshuffle(mode, oldMode)) return

    const current = video.value
    playerStore.playlistShuffle = createShuffledPlaylistIndexes(player.value.playlist.length)
    const nextIndex = playerStore.playlistShuffle[0]
    emit('play', { n: player.value.playlist[nextIndex], o: current })
    void scrollToNowPlaying()
  }, { deep: true })

  onMounted(() => {
    eventBus.on('scrollToNowPlaying', scrollToNowPlaying)
  })

  onBeforeUnmount(() => {
    eventBus.off('scrollToNowPlaying', scrollToNowPlaying)
  })

  return {
    playerStore,
    player,
    title,
    play,
    scrollToNowPlaying,
  }
}
