import {onBeforeUnmount, watch} from 'vue'
import type {usePlayerStore} from '@/stores/player'
import {createAbLoop, isAbLoopActive, loopJumpTarget} from '@/utils/playerAbLoop'
import {getAbsolutePlaybackTime} from '@/utils/playerBuffer'

const CHECK_INTERVAL_MS = 50
/** After a jump the element time may still be at B for a moment; do not jump again. */
const JUMP_COOLDOWN_MS = 400

/**
 * Wraps playback from B back to A. `timeupdate` is too coarse (~4 Hz) for a tight loop,
 * so while a complete loop is set the position is checked on a short timer.
 * The loop is dropped when another media starts or the player closes.
 */
export function usePlayerAbLoop(playerStore: ReturnType<typeof usePlayerStore>) {
  let timer: ReturnType<typeof setInterval> | null = null
  let cooldownUntil = 0

  const stop = () => {
    if (timer == null) return
    clearInterval(timer)
    timer = null
  }

  const check = () => {
    const video = playerStore.player
    if (!video || playerStore.paused || playerStore.seeking || playerStore.isLiveStreamSeeking || playerStore.webVideoLoading) return
    if (Date.now() < cooldownUntil) return
    const time = getAbsolutePlaybackTime({
      usesLiveTranscode: playerStore.usesLiveTranscode,
      liveStreamOffset: playerStore.liveStreamOffset,
      playerCurrentTime: video.currentTime,
    })
    const target = loopJumpTarget(playerStore.abLoop, time)
    if (target == null) return
    cooldownUntil = Date.now() + JUMP_COOLDOWN_MS
    playerStore.playerJumpTo(target, {silent: true})
  }

  watch(() => isAbLoopActive(playerStore.abLoop), active => {
    stop()
    if (active) timer = setInterval(check, CHECK_INTERVAL_MS)
  }, {immediate: true})

  watch(() => playerStore.media?.id, () => { playerStore.abLoop = createAbLoop() })

  onBeforeUnmount(() => {
    stop()
    playerStore.abLoop = createAbLoop()
  })
}
