import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { usePlayerStore } from '@/stores/player'
import { useEventBus } from '@/utils/eventBus'
import { checkColorForDarkText } from '@/utils/headerColorUtils'
import { getReadableDuration } from '@/services/formatUtils'
import {
  formatMarkTimeRange,
  getMarkTimelineColor,
  getMarkTimelineIcon,
  getMarkTimelinePositionStyle,
  getMarkTimelineWidthStyle,
} from '@/composable/playerMarkDisplay'
import { getPlayerPreviewAspectRatio } from '@/utils/playerPreviewPosition'
import { loadMarkImageDisplayUrl } from '@/utils/markThumb'
import type { PlayerMark } from '@/types/player'

interface PlayerMarkProps {
  mark: PlayerMark
  controls_width: number
}

export function usePlayerMark(
  props: PlayerMarkProps,
  emit: (event: 'removeMark', mark: PlayerMark) => void,
) {
  const appStore = useAppStore()
  const playerStore = usePlayerStore()
  const eventBus = useEventBus()

  const thumb = ref<string | null>(null)

  const icon = computed(() => getMarkTimelineIcon(props.mark))
  const color = computed(() => getMarkTimelineColor(props.mark))

  const colorMetaIcon = computed(() => {
    const isDark = checkColorForDarkText(color.value)
    return isDark ? 'white' : 'black'
  })

  const time = computed(() => formatMarkTimeRange(
    props.mark,
    (duration) => getReadableDuration(duration),
  ))

  const position = computed(() => getMarkTimelinePositionStyle(props.mark, playerStore.duration))

  const timeline_width = computed(() => getMarkTimelineWidthStyle(
    props.mark,
    playerStore.duration,
    props.controls_width,
  ))

  const tooltipStyle = computed(() => ({
    aspectRatio: String(getPlayerPreviewAspectRatio(playerStore.playlist, playerStore.nowPlaying)),
  }))

  const getImg = async () => {
    if (!appStore.mediaPath) return

    thumb.value = await loadMarkImageDisplayUrl({
      markId: props.mark.id,
      mediaPath: appStore.mediaPath,
      mediaId: playerStore.media?.id,
    })
  }

  const jumpTo = () => {
    playerStore.playerJumpTo(props.mark.time)
  }

  const remove = () => {
    emit('removeMark', props.mark)
  }

  const handleUpdateMarkImage = (id: unknown) => {
    if (props.mark.id === Number(id)) {
      void getImg()
    }
  }

  onMounted(() => {
    eventBus.on('updateMarkImage', handleUpdateMarkImage)
    void getImg()
  })

  watch(() => playerStore.media?.id, (mediaId, previousMediaId) => {
    if (!mediaId || mediaId === previousMediaId) return
    void getImg()
  })

  watch(() => appStore.mediaPath, (mediaPath) => {
    if (mediaPath) {
      void getImg()
    }
  })

  onBeforeUnmount(() => {
    eventBus.off('updateMarkImage', handleUpdateMarkImage)
  })

  return {
    playerStore,
    thumb,
    icon,
    color,
    colorMetaIcon,
    time,
    position,
    timeline_width,
    tooltipStyle,
    jumpTo,
    remove,
  }
}
