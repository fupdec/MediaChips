import { ref, computed, watch, onMounted, type Ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { usePlayerStore } from '@/stores/player'
import { useRegistrationStore } from '@/stores/registration'
import { useItemsStore } from '@/stores/items'
import { checkFileExists as checkPathExists } from '@/services/fileService'
import { getReadableDuration } from '@/services/formatUtils'
import { getCachedThumb, isPersistentThumbUrl, mediaThumbKey } from '@/utils/thumbDisplayCache'
import { resolveMediaThumbDisplayUrl } from '@/utils/thumbSource'
import type { MediaItem } from '@/types/stores'

const UNREGISTERED_PLAYLIST_LIMIT = 14

interface PlaylistItemProps {
  index: number
  video: MediaItem
}

export function usePlaylistItem(
  props: PlaylistItemProps,
  emit: (event: 'play', index: number) => void,
) {
  const appStore = useAppStore()
  const playerStore = usePlayerStore()
  const registrationStore = useRegistrationStore()
  const itemsStore = useItemsStore()

  const thumb = ref<string | null>(null)
  const is_file_exists = ref(true)

  const player = computed(() => playerStore)
  const reg = computed(() => registrationStore.reg)

  const is_now_playing = computed(() => player.value.nowPlaying === props.index)

  const is_locked = computed(() => !reg.value && props.index > UNREGISTERED_PLAYLIST_LIMIT)

  const getThumb = () => {
    const cached = getCachedThumb(mediaThumbKey('videos', props.video.id))
    if (isPersistentThumbUrl(cached)) {
      thumb.value = cached ?? null
      return
    }

    thumb.value = resolveMediaThumbDisplayUrl(
      appStore.mediaPath,
      'videos',
      props.video.id,
    ) ?? null
  }

  const getDuration = (time: number) => getReadableDuration(time)

  const checkVideoFileExists = async () => {
    is_file_exists.value = await checkPathExists(props.video.path || '')
  }

  const play = () => {
    if (is_file_exists.value && !is_now_playing.value && !is_locked.value) {
      emit('play', props.index)
    }
  }

  watch(() => itemsStore.thumbRefreshKeys[Number(props.video.id)], (version) => {
    if (version == null) return
    void getThumb()
  })

  onMounted(() => {
    if (!thumb.value) {
      void getThumb()
    }
    void checkVideoFileExists()
  })

  return {
    thumb,
    is_file_exists,
    is_now_playing,
    is_locked,
    reg,
    getDuration,
    play,
  }
}
