import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import type {usePlayerStore} from '@/stores/player'
import {mediaSubtitlesApi} from '@/services/typedApi/mediaSubtitles'
import {getAbsolutePlaybackTime} from '@/utils/playerBuffer'
import {clampSubtitleScale} from '@/utils/playerSubtitleActions'
import {cueTextToHtml, findActiveCues, parseSubtitles, type SubtitleCue} from '@/utils/subtitles'

const SCALE_STORAGE_KEY = 'mediachips.player.subtitleScale'
const TICK_MS = 80

function loadScale(): number {
  try {
    const raw = localStorage.getItem(SCALE_STORAGE_KEY)
    return raw == null ? 1 : clampSubtitleScale(Number(raw))
  } catch {
    return 1
  }
}

/**
 * External subtitles (.srt/.vtt next to a local video), drawn by the player itself instead of a <track>
 * so they stay upright and sharp under rotation, zoom and colour filters, and follow the absolute
 * time of live transcode. The first track found is switched on; the size is remembered, the delay is not.
 */
export function usePlayerSubtitles(playerStore: ReturnType<typeof usePlayerStore>) {
  const cues = shallowRef<SubtitleCue[]>([])
  const now = ref(0)
  let tracksToken = 0
  let cuesToken = 0
  let timer: ReturnType<typeof setInterval> | null = null

  playerStore.subtitleScale = loadScale()
  watch(() => playerStore.subtitleScale, scale => {
    try { localStorage.setItem(SCALE_STORAGE_KEY, String(scale)) } catch { /* the size just applies to this session */ }
  })

  const loadTracks = async (id: number | undefined) => {
    const token = ++tracksToken
    playerStore.subtitleTracks = []
    playerStore.subtitleTrackName = null
    playerStore.subtitleDelay = 0
    if (!id || id <= 0 || playerStore.isAudioMode) return
    try {
      const {data} = await mediaSubtitlesApi.list(id)
      if (token !== tracksToken) return
      playerStore.subtitleTracks = data.tracks
      playerStore.subtitleTrackName = data.tracks[0]?.name ?? null
    } catch {
      // Subtitles are optional: without them the player is unchanged.
    }
  }
  watch(() => playerStore.media?.id, id => { void loadTracks(id) }, {immediate: true})

  watch(() => playerStore.subtitleTrackName, async name => {
    const token = ++cuesToken
    cues.value = []
    const id = playerStore.media?.id
    if (!name || !id || id <= 0) return
    try {
      const {data} = await mediaSubtitlesApi.read(id, name)
      if (token === cuesToken) cues.value = parseSubtitles(data.text)
    } catch {
      if (token === cuesToken) cues.value = []
    }
  }, {immediate: true})

  const readTime = () => {
    const video = playerStore.player
    if (!video) return Number(playerStore.currentTime) || 0
    return getAbsolutePlaybackTime({
      usesLiveTranscode: playerStore.usesLiveTranscode,
      liveStreamOffset: playerStore.liveStreamOffset,
      playerCurrentTime: video.currentTime,
    })
  }

  const active = computed(() => cues.value.length > 0 && playerStore.subtitleTrackName != null)
  const stop = () => {
    if (timer == null) return
    clearInterval(timer)
    timer = null
  }
  // `timeupdate` is too coarse for subtitles (~4 Hz), so the time is read on a short timer while they are shown.
  watch(active, isActive => {
    stop()
    if (!isActive) return
    now.value = readTime()
    timer = setInterval(() => { now.value = readTime() }, TICK_MS)
  }, {immediate: true})
  onBeforeUnmount(stop)

  const subtitleHtml = computed(() => {
    if (!active.value) return ''
    return findActiveCues(cues.value, now.value - playerStore.subtitleDelay)
      .map(cue => cueTextToHtml(cue.text))
      .join('<br>')
  })

  return {subtitleHtml}
}
