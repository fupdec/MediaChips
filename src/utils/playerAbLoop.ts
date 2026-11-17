export interface AbLoop {
  a: number | null
  b: number | null
}

/** A loop shorter than this is treated as an accidental double press: B replaces A instead. */
export const MIN_AB_LOOP_SECONDS = 0.5

export type Translate = (key: string) => string

/** The part of the player store that the A-B loop hotkey reads and writes. */
export interface AbLoopStoreLike {
  currentTime: number
  abLoop: AbLoop
  changePlayerStatusText?: (payload: { text: string; icon: string; subtitleKey?: string | null }) => void
}

export function createAbLoop(): AbLoop {
  return {a: null, b: null}
}

export function isAbLoopActive(loop: AbLoop): loop is { a: number; b: number } {
  return loop.a != null && loop.b != null && loop.b > loop.a
}

/** Press cycle: set A, set B (the loop starts), clear. */
export function nextAbLoop(loop: AbLoop, time: number): AbLoop {
  if (loop.a == null) return {a: time, b: null}
  if (loop.b == null) {
    return time - loop.a >= MIN_AB_LOOP_SECONDS ? {a: loop.a, b: time} : {a: time, b: null}
  }
  return createAbLoop()
}

/** Where to jump when playback has reached B; null while inside the loop or without one. */
export function loopJumpTarget(loop: AbLoop, time: number): number | null {
  return isAbLoopActive(loop) && time >= loop.b ? loop.a : null
}

export function formatLoopTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}

export function cycleAbLoop(store: AbLoopStoreLike, t: Translate): void {
  const next = nextAbLoop(store.abLoop, store.currentTime)
  store.abLoop = next
  const subtitleKey = 'player.ab_loop_label'
  if (next.a == null) {
    store.changePlayerStatusText?.({text: t('player.ab_loop_off'), icon: 'repeat-off', subtitleKey})
  } else if (next.b == null) {
    store.changePlayerStatusText?.({text: `A  ${formatLoopTime(next.a)}`, icon: 'alpha-a-circle-outline', subtitleKey})
  } else {
    store.changePlayerStatusText?.({
      text: `A ${formatLoopTime(next.a)} – B ${formatLoopTime(next.b)}`,
      icon: 'repeat',
      subtitleKey,
    })
  }
}
