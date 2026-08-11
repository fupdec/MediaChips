import {computed, watch} from 'vue'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {usePlayerStore} from '@/stores/player'
import {
  getRemainingPlaybackSeconds,
  isPlaylistNavDisabled,
  resolvePlaylistIndex,
  shouldShowUpNextPreview,
} from '@/composable/usePlayerTransportPlayback'
import {getCachedThumb, isPersistentThumbUrl, mediaThumbKey} from '@/utils/thumbDisplayCache'
import {resolveMediaThumbDisplayUrl} from '@/utils/thumbSource'
import type {MediaItem} from '@/types/stores'

function resolveNeighborThumb(mediaPath: string, item: MediaItem | null | undefined): string | null {
  if (!item?.id) return null

  const cached = getCachedThumb(mediaThumbKey('videos', item.id, 'thumbs'))
  if (isPersistentThumbUrl(cached)) return cached ?? null

  return resolveMediaThumbDisplayUrl(mediaPath, 'videos', item.id) ?? null
}

export function usePlayerNeighborPreview() {
  const appStore = useAppStore()
  const itemsStore = useItemsStore()
  const playerStore = usePlayerStore()

  const navBase = computed(() => ({
    playlistMode: playerStore.playlistMode,
    playlistShuffle: playerStore.playlistShuffle,
    nowPlaying: playerStore.nowPlaying,
    playlistLength: playerStore.playlist.length,
  }))

  const prevIndex = computed(() => {
    if (isPlaylistNavDisabled({...navBase.value, direction: 'prev'})) return undefined
    return resolvePlaylistIndex({...navBase.value, direction: 'prev'})
  })

  const nextIndex = computed(() => {
    if (isPlaylistNavDisabled({...navBase.value, direction: 'next'})) return undefined
    return resolvePlaylistIndex({...navBase.value, direction: 'next'})
  })

  const prevItem = computed(() => {
    const index = prevIndex.value
    if (index == null) return null
    return playerStore.playlist[index] ?? null
  })

  const nextItem = computed(() => {
    const index = nextIndex.value
    if (index == null) return null
    return playerStore.playlist[index] ?? null
  })

  // Recompute thumbs when a neighbor id refreshes (new poster generated).
  const prevThumb = computed(() => {
    void itemsStore.thumbRefreshKeys[Number(prevItem.value?.id)]
    return resolveNeighborThumb(appStore.mediaPath || '', prevItem.value)
  })

  const nextThumb = computed(() => {
    void itemsStore.thumbRefreshKeys[Number(nextItem.value?.id)]
    return resolveNeighborThumb(appStore.mediaPath || '', nextItem.value)
  })

  const remainingSeconds = computed(() =>
    getRemainingPlaybackSeconds(playerStore.currentTime, playerStore.duration),
  )

  const showUpNext = computed(() => shouldShowUpNextPreview({
    remainingSeconds: remainingSeconds.value,
    hasNext: nextItem.value != null,
  }))

  // Keep chrome visible so the up-next card is not display:none'd with controls.
  watch(showUpNext, (show) => {
    if (show) playerStore.isControlsVisible = true
  })

  return {
    prevItem,
    nextItem,
    prevThumb,
    nextThumb,
    remainingSeconds,
    showUpNext,
  }
}
