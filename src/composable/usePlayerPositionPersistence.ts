import {onBeforeUnmount, watch, type Ref} from 'vue'
import type {usePlayerStore} from '@/stores/player'
import type {MediaItem} from '@/types/stores'

/** Checkpoint during playback so a lost connection or process does not lose the whole session. */
export function usePlayerPositionPersistence(
  player: ReturnType<typeof usePlayerStore>,
  ready: Ref<boolean | null>,
  save: (media: MediaItem, position: number) => Promise<boolean | void>,
) {
  let lastSaved = ''
  let saving = false
  const checkpoint = () => {
    const media = player.media
    const position = player.currentTime
    if (!player.active || !ready.value || !media || media.id <= 0 || player.webVideoLoading
      || player.isLiveStreamSeeking || player.player?.seeking || !Number.isFinite(position) || position < 0) return
    const key = `${media.id}:${position}`
    if (key === lastSaved || saving) return
    saving = true
    void save(media, position).then(saved => {
      if (saved !== false) lastSaved = key
    }).catch(() => {}).finally(() => { saving = false })
  }
  const timer = window.setInterval(checkpoint, 5000)
  watch(() => player.paused, paused => { if (paused) checkpoint() })
  onBeforeUnmount(() => { checkpoint(); window.clearInterval(timer) })
}
