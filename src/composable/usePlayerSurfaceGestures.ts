import {onBeforeUnmount, shallowRef, type Ref} from 'vue'
import {SEEK_STEP_SECONDS} from '@/utils/playerHotkeys'
import {
  createPlayerSurfaceGestureHandlers,
  type PlayerGestureAction,
  type PlayerGestureHandlers,
} from '@/utils/playerSurfaceGestures'

type PlayerStoreLike = {
  currentTime?: number
  player?: {currentTime: number} | null
  playerJumpTo?: (time: number) => void
  changePlayerStatusText?: (payload: {
    text: string
    icon: string
    large?: boolean
  }) => void
}

type ControlsLike = {
  prev?: () => void
  next?: () => void
  togglePause?: () => void
} | null

export function usePlayerSurfaceGestures(options: {
  playerStore: PlayerStoreLike
  controls: Ref<ControlsLike>
  togglePause: () => void
  toggleFullscreen: () => void
  showControls?: () => void
  seekStepSeconds?: number
}) {
  const surfaceEl = shallowRef<HTMLElement | null>(null)
  const seekStepSeconds = options.seekStepSeconds ?? SEEK_STEP_SECONDS

  const handleAction = (action: PlayerGestureAction) => {
    options.showControls?.()

    switch (action.type) {
      case 'prev':
        options.controls.value?.prev?.()
        break
      case 'next':
        options.controls.value?.next?.()
        break
      case 'togglePause':
        options.togglePause()
        break
      case 'toggleFullscreen':
        void options.toggleFullscreen()
        break
      case 'seek': {
        const base = options.playerStore.currentTime
          ?? options.playerStore.player?.currentTime
          ?? 0
        const nextTime = base + action.deltaSeconds
        options.playerStore.playerJumpTo?.(nextTime)
        const label = action.deltaSeconds < 0
          ? `−${Math.abs(action.deltaSeconds)}s`
          : `+${action.deltaSeconds}s`
        options.playerStore.changePlayerStatusText?.({
          text: label,
          icon: action.deltaSeconds < 0 ? 'rewind-10' : 'fast-forward-10',
          large: true,
        })
        break
      }
    }
  }

  let handlers: PlayerGestureHandlers | null = createPlayerSurfaceGestureHandlers({
    seekStepSeconds,
    getSurfaceEl: () => surfaceEl.value,
    onAction: handleAction,
  })

  const setSurfaceEl = (el: unknown) => {
    surfaceEl.value = (el as HTMLElement | null) ?? null
  }

  onBeforeUnmount(() => {
    handlers?.dispose()
    handlers = null
  })

  return {
    setSurfaceEl,
    onPointerDown: (event: PointerEvent) => handlers?.onPointerDown(event),
    onPointerMove: (event: PointerEvent) => handlers?.onPointerMove(event),
    onPointerUp: (event: PointerEvent) => handlers?.onPointerUp(event),
    onPointerCancel: (event: PointerEvent) => handlers?.onPointerCancel(event),
    onClick: (event: MouseEvent) => handlers?.onClick(event),
    onDblClick: (event: MouseEvent) => handlers?.onDblClick(event),
  }
}
