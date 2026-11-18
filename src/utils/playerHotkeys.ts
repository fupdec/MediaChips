import { shouldUseWheelSeek, preventWheelDefault, getVolumeDeltaFromWheel } from '@/utils/playerWheel'
import {
  cycleAspectMode,
  flipPicture,
  resetPicture,
  rotatePicture,
  zoomPicture,
  type PictureStoreLike,
  type Translate,
} from '@/utils/playerPictureActions'
import { cycleAbLoop, type AbLoopStoreLike } from '@/utils/playerAbLoop'
import {
  cycleSubtitleTrack,
  shiftSubtitleDelay,
  SUBTITLE_DELAY_STEP,
  type SubtitleStoreLike,
} from '@/utils/playerSubtitleActions'

export const SEEK_STEP_SECONDS = 10
export const SEEK_SHIFT_MULTIPLIER = 3
export const SEEK_REPEAT_THROTTLE_MS = 120

let lastSeekAt = 0

export function isPlainKey(event: KeyboardEvent): boolean {
  return !event.ctrlKey && !event.metaKey && !event.altKey
}

interface PlayerStoreLike extends Partial<PictureStoreLike>, Partial<AbLoopStoreLike>, Partial<SubtitleStoreLike> {
  active?: boolean
  areaSelecting?: boolean
  isKeyboardBlocked?: boolean
  studioMode?: boolean
  trimMode?: boolean
  currentTime?: number
  player?: { currentTime: number } | null
  playerJumpTo?: (time: number) => void
}

export function shouldHandlePlayerShortcut(event: KeyboardEvent, playerStore: PlayerStoreLike): boolean {
  if (!playerStore.active) return false
  if (playerStore.isKeyboardBlocked) return false

  const target = event.target
  if (!(target instanceof Element)) return true

  const tagName = target.tagName
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || (target as HTMLElement).isContentEditable) {
    return false
  }

  if (target.closest('[data-ignore-player-hotkeys]')) {
    return false
  }

  return true
}

/** Picture hotkeys need the picture state and a video (not audio) playback. */
function pictureStore(playerStore: PlayerStoreLike): PictureStoreLike | null {
  if (playerStore.isAudioMode) return null
  if (typeof playerStore.aspectMode !== 'string' || playerStore.videoFilters == null || typeof playerStore.zoom !== 'number') return null
  return playerStore as PictureStoreLike
}

function abLoopStore(playerStore: PlayerStoreLike): AbLoopStoreLike | null {
  if (typeof playerStore.currentTime !== 'number' || playerStore.abLoop == null) return null
  return playerStore as AbLoopStoreLike
}

function subtitleStore(playerStore: PlayerStoreLike): SubtitleStoreLike | null {
  if (!Array.isArray(playerStore.subtitleTracks) || typeof playerStore.subtitleDelay !== 'number') return null
  return playerStore as SubtitleStoreLike
}

function shouldThrottleSeek(event: KeyboardEvent): boolean {
  if (!event.repeat) return false

  const now = Date.now()
  if (now - lastSeekAt < SEEK_REPEAT_THROTTLE_MS) return true

  lastSeekAt = now
  return false
}

function seekByDelta(playerStore: PlayerStoreLike, delta: number, event: KeyboardEvent): boolean {
  if (!playerStore.player) return false
  if (shouldThrottleSeek(event)) return false

  const baseTime = playerStore.currentTime ?? playerStore.player.currentTime
  playerStore.playerJumpTo?.(baseTime + delta)
  return true
}

type PlayerControlsLike = Record<string, unknown> & {
  jumpToMark?: (type: 'prev' | 'next') => void
  wheelSeek?: (event: WheelEvent) => void
  deleteVideo?: (withFile?: boolean) => void
}

function callControl(controls: PlayerControlsLike | null | undefined, method: string): boolean {
  const fn = controls?.[method]
  if (typeof fn === 'function') {
    fn()
    return true
  }
  return false
}

export interface PlayerHotkeyContext {
  playerStore: PlayerStoreLike
  controls?: PlayerControlsLike | null
  togglePause?: () => void
  toggleFullscreen?: () => void
  changeVolume?: (payload: { deltaY: number }) => void
  openAddingMark?: (type: string) => void
  closePlayer?: () => void
  /** Translates the on-screen status of picture hotkeys; keys are shown as is without it. */
  t?: Translate
}

export function handlePlayerKeydown(event: KeyboardEvent, ctx: PlayerHotkeyContext): boolean {
  const {
    playerStore,
    controls,
    togglePause,
    toggleFullscreen,
    changeVolume,
    openAddingMark,
    closePlayer,
    t = (key: string) => key,
  } = ctx

  let step = SEEK_STEP_SECONDS

  switch (true) {
    case event.code === 'Escape':
      if (playerStore.areaSelecting) {
        playerStore.areaSelecting = false
        return true
      }
      if (playerStore.trimMode) {
        return callControl(controls, 'exitTrimMode')
      }
      if (playerStore.studioMode) {
        return callControl(controls, 'exitStudioLayer')
      }
      if (!playerStore.isKeyboardBlocked && typeof closePlayer === 'function') {
        closePlayer()
        return true
      }
      return false

    case event.code === 'KeyZ' && isPlainKey(event):
    case event.altKey && event.code === 'ArrowLeft':
      return callControl(controls, 'prev')

    case event.code === 'KeyC' && isPlainKey(event):
    case event.altKey && event.code === 'ArrowRight':
      return callControl(controls, 'next')

    case event.code === 'Space' && isPlainKey(event):
      if (typeof togglePause === 'function') {
        togglePause()
        return true
      }
      return false

    case event.code === 'ArrowRight' && !event.altKey && !event.ctrlKey && !event.metaKey:
      if (event.shiftKey) step *= SEEK_SHIFT_MULTIPLIER
      return seekByDelta(playerStore, step, event)

    case event.code === 'ArrowLeft' && !event.altKey && !event.ctrlKey && !event.metaKey:
      if (event.shiftKey) step *= SEEK_SHIFT_MULTIPLIER
      return seekByDelta(playerStore, -step, event)

    case event.code === 'ArrowUp' && !event.altKey && !event.ctrlKey && !event.metaKey:
      if (typeof changeVolume === 'function') {
        changeVolume({ deltaY: +100 })
        return true
      }
      return false

    case event.code === 'ArrowDown' && !event.altKey && !event.ctrlKey && !event.metaKey:
      if (typeof changeVolume === 'function') {
        changeVolume({ deltaY: -100 })
        return true
      }
      return false

    case event.code === 'KeyF' && isPlainKey(event):
      if (typeof toggleFullscreen === 'function') {
        toggleFullscreen()
        return true
      }
      return false

    case event.code === 'KeyM' && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey:
      return callControl(controls, 'toggleStudioMode')

    case event.code === 'KeyM' && isPlainKey(event):
      return callControl(controls, 'toggleMute')

    case event.code === 'KeyP' && isPlainKey(event):
      return callControl(controls, 'togglePlaylist')

    case event.code === 'KeyT' && isPlainKey(event):
      return callControl(controls, 'toggleTrimMode')

    case event.code === 'KeyI' && isPlainKey(event):
      if (playerStore.trimMode) return callControl(controls, 'setTrimIn')
      return callControl(controls, 'toggleMarks')

    case event.code === 'KeyO' && isPlainKey(event):
      if (playerStore.trimMode) return callControl(controls, 'setTrimOut')
      return false

    case event.code === 'Enter' && isPlainKey(event):
      if (playerStore.trimMode) return callControl(controls, 'applyTrim')
      return false

    case event.code === 'Comma' && isPlainKey(event):
      if (typeof controls?.jumpToMark === 'function') {
        controls.jumpToMark('prev')
        return true
      }
      return false

    case event.code === 'Period' && isPlainKey(event):
      if (typeof controls?.jumpToMark === 'function') {
        controls.jumpToMark('next')
        return true
      }
      return false

    case event.code === 'KeyX' && isPlainKey(event):
      return callControl(controls, 'stop')

    case event.code === 'Digit1' && isPlainKey(event):
      if (typeof openAddingMark === 'function') {
        openAddingMark('favorite')
        return true
      }
      return false

    case event.code === 'Digit2' && isPlainKey(event):
      if (typeof openAddingMark === 'function') {
        openAddingMark('bookmark')
        return true
      }
      return false

    case event.code === 'KeyE' && isPlainKey(event):
      return callControl(controls, 'editVideo')

    case event.code === 'KeyA' && isPlainKey(event): {
      const store = pictureStore(playerStore)
      if (!store) return false
      cycleAspectMode(store, t, event.shiftKey ? -1 : 1)
      return true
    }

    case event.code === 'KeyR' && isPlainKey(event): {
      const store = pictureStore(playerStore)
      if (!store) return false
      rotatePicture(store, event.shiftKey ? -90 : 90)
      return true
    }

    case event.code === 'KeyH' && isPlainKey(event): {
      const store = pictureStore(playerStore)
      if (!store) return false
      flipPicture(store, 'h', t)
      return true
    }

    case event.code === 'KeyV' && isPlainKey(event): {
      const store = pictureStore(playerStore)
      if (!store) return false
      flipPicture(store, 'v', t)
      return true
    }

    case event.code === 'KeyL' && isPlainKey(event): {
      const store = abLoopStore(playerStore)
      if (!store) return false
      cycleAbLoop(store, t)
      return true
    }

    case event.code === 'KeyS' && isPlainKey(event): {
      if (typeof playerStore.areaSelecting !== 'boolean' || playerStore.isAudioMode) return false
      playerStore.areaSelecting = !playerStore.areaSelecting
      return true
    }

    case event.code === 'KeyJ' && isPlainKey(event): {
      const store = subtitleStore(playerStore)
      if (!store) return false
      cycleSubtitleTrack(store, t)
      return true
    }

    case (event.code === 'BracketLeft' || event.code === 'BracketRight') && isPlainKey(event): {
      const store = subtitleStore(playerStore)
      if (!store || store.subtitleTracks.length === 0) return false
      shiftSubtitleDelay(store, event.code === 'BracketRight' ? SUBTITLE_DELAY_STEP : -SUBTITLE_DELAY_STEP)
      return true
    }

    case (event.code === 'Equal' || event.code === 'NumpadAdd') && isPlainKey(event): {
      const store = pictureStore(playerStore)
      if (!store) return false
      zoomPicture(store, 1)
      return true
    }

    case (event.code === 'Minus' || event.code === 'NumpadSubtract') && isPlainKey(event): {
      const store = pictureStore(playerStore)
      if (!store) return false
      zoomPicture(store, -1)
      return true
    }

    case event.code === 'Digit0' && isPlainKey(event): {
      const store = pictureStore(playerStore)
      if (!store) return false
      resetPicture(store, t)
      return true
    }

    case event.code === 'Backspace' || event.code === 'Delete':
      if (event.shiftKey && (event.ctrlKey || event.altKey)) {
        if (typeof controls?.deleteVideo === 'function') {
          controls.deleteVideo(true)
          return true
        }
      } else if (event.ctrlKey || event.altKey) {
        if (typeof controls?.deleteVideo === 'function') {
          controls.deleteVideo()
          return true
        }
      }
      return false

    default:
      return false
  }
}

export function handlePlayerVideoWheel(
  event: WheelEvent,
  {
    controls,
    changeVolume,
  }: {
    controls?: PlayerControlsLike | null
    changeVolume?: (payload: { deltaY: number }) => void
  },
): void {
  if (shouldUseWheelSeek(event)) {
    if (typeof controls?.wheelSeek === 'function') {
      controls.wheelSeek(event)
    }
    return
  }

  if (typeof changeVolume === 'function') {
    preventWheelDefault(event)
    changeVolume({ deltaY: getVolumeDeltaFromWheel(event) })
  }
}
