import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { usePlayerStore } from '@/stores/player'
import {
  getPrimaryWheelDelta,
  getSeekSecondsFromWheel,
  preventWheelDefault,
} from '@/utils/playerWheel'
import {
  getTimelinePercents,
  shouldShowTranscodeTimeline,
} from '@/utils/playerBuffer'
import {computeTimelineHoverPercent} from '@/utils/playerPreviewPosition'
import orderBy from 'lodash/orderBy'
import type { PlayerMark } from '@/types/player'

export function findMarkToJump(
  marks: PlayerMark[],
  currentTime: number,
  type: 'prev' | 'next',
): PlayerMark | null {
  const ordered = type === 'prev'
    ? orderBy(marks, 'time', ['desc'])
    : marks

  const threshold = type === 'prev' ? currentTime - 5 : currentTime

  for (const mark of ordered) {
    if (type === 'prev' && mark.time < threshold) return mark
    if (type === 'next' && mark.time > threshold) return mark
  }

  return null
}

export function getMarkStatusLabel(mark: PlayerMark | null | undefined): string {
  if (!mark) return ''
  if (mark.type === 'meta') return String(mark['tag.name'] || '')
  return String(mark.name || '')
}

interface SliderProgressRef {
  $el?: HTMLElement
}

interface UsePlayerTimelineOptions {
  emit: {
    (event: 'showControls'): void
    (event: 'removeMark', mark: PlayerMark): void
  }
}

export function usePlayerTimeline({ emit }: UsePlayerTimelineOptions) {
  const playerStore = usePlayerStore()
  const player = computed(() => playerStore)

  const slider_progress = ref<SliderProgressRef | null>(null)
  const is_mounted = ref(false)
  const resized = ref(0)
  const preview_event_target = ref<HTMLElement | null>(null)
  const preview_show = ref(true)

  let previewRafId: number | null = null
  let previewPendingX: number | null = null
  let timelineResizeObserver: ResizeObserver | null = null

  const controls_width = computed(() => {
    if (is_mounted.value && resized.value > -1 && slider_progress.value) {
      return slider_progress.value?.$el?.clientWidth || 0
    }
    return 0
  })

  const timelineTime = computed(() =>
    player.value.seeking ? player.value.seekTime : player.value.currentTime,
  )

  const showTranscodeTimeline = computed(() =>
    shouldShowTranscodeTimeline({
      usesLiveTranscode: player.value.usesLiveTranscode,
    }),
  )

  const timelineDisplay = computed(() => {
    const state = player.value
    return getTimelinePercents({
      currentTime: timelineTime.value,
      duration: state.duration,
      bufferedRanges: state.bufferedRanges,
      usesLiveTranscode: state.usesLiveTranscode,
      isLiveStreamSeeking: state.isLiveStreamSeeking,
      isStreamWaiting: state.isStreamWaiting,
    })
  })

  const timelineTrackStyle = computed(() => {
    if (!showTranscodeTimeline.value) return undefined

    return {
      '--timeline-buffer': `${timelineDisplay.value.buffer}%`,
    }
  })

  const jumpTo = (time: number) => {
    playerStore.playerJumpTo(time)
  }

  const jumpToSeconds = (time: number) => {
    jumpTo(player.value.currentTime + time)
  }

  const jumpToMark = (type: 'prev' | 'next') => {
    const mark = findMarkToJump(player.value.marks, player.value.currentTime, type)
    if (!mark) return

    jumpTo(mark.time)
    playerStore.changePlayerStatusText({
      text: getMarkStatusLabel(mark),
      icon: 'tooltip',
    })
  }

  const startSeeking = (time: number) => {
    playerStore.seeking = true
    playerStore.seekTime = time
  }

  const seek = (time: number) => {
    playerStore.seeking = false
    jumpTo(time)
  }

  const handleSliderChange = (value: number) => {
    if (player.value.seeking) {
      playerStore.seekTime = value
    }
  }

  const wheelSeek = (e: WheelEvent) => {
    if (!player.value.is_file_exists || player.value.playbackError) return

    preventWheelDefault(e)
    emit('showControls')

    if (e.altKey) {
      getPrimaryWheelDelta(e) > 0 ? jumpToMark('prev') : jumpToMark('next')
      return
    }

    const seconds = getSeekSecondsFromWheel(e)
    if (!seconds) return

    jumpToSeconds(seconds)
  }

  const handleMouseSeek = (e: MouseEvent) => {
    switch (e.button) {
      case 3:
        jumpToMark('prev')
        break
      case 4:
        jumpToMark('next')
        break
    }
  }

  const saveEvent = (e: MouseEvent) => {
    preview_show.value = true
    preview_event_target.value = e.currentTarget as HTMLElement
  }

  const showPreview = (e: MouseEvent) => {
    if (!preview_show.value || !preview_event_target.value) return

    previewPendingX = e.clientX
    if (previewRafId) return

    previewRafId = requestAnimationFrame(() => {
      previewRafId = null
      const clientX = previewPendingX
      if (clientX == null || !preview_event_target.value) return

      const currentTargetRect = preview_event_target.value.getBoundingClientRect()
      const width = currentTargetRect.width
      if (!width) return

      const hoverPercent = computeTimelineHoverPercent(clientX, currentTargetRect)
      if (hoverPercent == null) return

      playerStore.progress_hover = hoverPercent
    })
  }

  const clearPreviewHover = () => {
    playerStore.progress_hover = null
    preview_show.value = false
  }

  const resize = () => {
    ++resized.value
  }

  const observeTimelineResize = () => {
    const el = slider_progress.value?.$el || slider_progress.value
    if (!el || typeof ResizeObserver === 'undefined') return

    timelineResizeObserver?.disconnect()
    timelineResizeObserver = new ResizeObserver(() => {
      resize()
    })
    timelineResizeObserver.observe(el as Element)
  }

  onMounted(() => {
    is_mounted.value = true
    window.addEventListener('resize', resize)
    nextTick(observeTimelineResize)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', resize)
    timelineResizeObserver?.disconnect()
    timelineResizeObserver = null
    if (previewRafId) {
      cancelAnimationFrame(previewRafId)
    }
  })

  watch(
    () => [playerStore.marksVisible, playerStore.playlistVisible],
    () => nextTick(resize),
  )

  return {
    player,
    playerStore,
    slider_progress,
    controls_width,
    showTranscodeTimeline,
    timelineDisplay,
    timelineTime,
    timelineTrackStyle,
    startSeeking,
    seek,
    handleSliderChange,
    wheelSeek,
    handleMouseSeek,
    saveEvent,
    showPreview,
    clearPreviewHover,
    jumpToMark,
    resize,
  }
}
