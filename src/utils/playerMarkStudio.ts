export const MIN_MARK_DURATION = 0.5
export const MARK_SNAP_SECONDS = 0.3
export const MARK_DRAG_THRESHOLD_PX = 4

export type MarkDragMode = 'move' | 'resize-start' | 'resize-end'

export interface MarkInterval {
  id?: number | null
  time: number
  end?: number | null
}

export function clampMarkValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function pxToMarkTime(px: number, controlsWidth: number, duration: number): number {
  if (!controlsWidth || !duration) return 0
  return px * duration / controlsWidth
}

export function timeFromTrackClientX(clientX: number, rect: DOMRect, duration: number): number {
  if (!rect.width || !duration) return 0
  const percent = clampMarkValue((clientX - rect.left) / rect.width, 0, 1)
  return percent * duration
}

export function snapMarkTime(
  value: number,
  targets: number[],
  snapSeconds = MARK_SNAP_SECONDS,
): { value: number; snapped: boolean; target: number | null } {
  let best = value
  let bestDiff = snapSeconds
  let target: number | null = null

  for (const candidate of targets) {
    const diff = Math.abs(candidate - value)
    if (diff < bestDiff) {
      bestDiff = diff
      best = candidate
      target = candidate
    }
  }

  return { value: best, snapped: target != null, target }
}

export function collectMarkSnapTargets(
  marks: MarkInterval[],
  currentTime: number,
  excludeId: number,
): number[] {
  const targets: number[] = [currentTime]
  for (const mark of marks) {
    if (mark.id === excludeId) continue
    targets.push(mark.time)
    if (mark.end != null) targets.push(mark.end)
  }
  return targets
}

export function computeMarkDragDraft({
  mode,
  startTime,
  startEnd,
  deltaTime,
  duration,
  targets,
  minDuration = MIN_MARK_DURATION,
}: {
  mode: MarkDragMode
  startTime: number
  startEnd: number | null
  deltaTime: number
  duration: number
  targets: number[]
  minDuration?: number
}): { time: number; end: number | null; snapTime: number | null } {
  if (mode === 'move') {
    const span = startEnd != null ? startEnd - startTime : 0
    const next = snapMarkTime(
      clampMarkValue(startTime + deltaTime, 0, Math.max(0, duration - span)),
      targets,
    )
    return {
      time: next.value,
      end: startEnd != null ? next.value + span : null,
      snapTime: next.target,
    }
  }

  if (mode === 'resize-start') {
    const maxStart = (startEnd ?? duration) - minDuration
    const next = snapMarkTime(
      clampMarkValue(startTime + deltaTime, 0, Math.max(0, maxStart)),
      targets,
    )
    const time = Math.min(next.value, maxStart)
    return { time, end: startEnd, snapTime: next.target }
  }

  const minEnd = startTime + minDuration
  const next = snapMarkTime(
    clampMarkValue((startEnd ?? startTime) + deltaTime, minEnd, duration),
    targets,
  )
  const end = Math.max(next.value, minEnd)
  return { time: startTime, end, snapTime: next.target }
}

export function computeMarkWheelNudge({
  time,
  end,
  delta,
  shiftKey,
  duration,
  minDuration = MIN_MARK_DURATION,
}: {
  time: number
  end: number | null
  delta: number
  shiftKey: boolean
  duration: number
  minDuration?: number
}): { time: number; end: number | null } {
  if (shiftKey) {
    const nextEnd = clampMarkValue(
      (end ?? time + minDuration) + (end == null ? 0 : delta),
      time + minDuration,
      duration,
    )
    return { time, end: nextEnd }
  }

  const span = end != null ? end - time : 0
  const nextTime = clampMarkValue(time + delta, 0, Math.max(0, duration - span))
  return { time: nextTime, end: end != null ? nextTime + span : null }
}

export function assignMarkLanes(marks: MarkInterval[]): {
  lanes: Map<number, number>
  laneCount: number
} {
  const items = marks
    .filter((mark) => mark.id != null)
    .map((mark) => {
      const start = Number(mark.time) || 0
      const rawEnd = mark.end == null ? start : Number(mark.end)
      return {
        id: Number(mark.id),
        start,
        end: rawEnd > start ? rawEnd : start + 1e-6,
      }
    })
    .sort((left, right) => left.start - right.start || left.end - right.end)

  const laneEnds: number[] = []
  const lanes = new Map<number, number>()

  for (const item of items) {
    let lane = laneEnds.findIndex((end) => end <= item.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(item.end)
    } else {
      laneEnds[lane] = item.end
    }
    lanes.set(item.id, lane)
  }

  return { lanes, laneCount: Math.max(1, laneEnds.length) }
}

export function clampInspectorDock({
  hostWidth,
  dockWidth,
  anchorRatio,
  edge = 0,
  caretInset = 16,
}: {
  hostWidth: number
  dockWidth: number
  anchorRatio: number
  edge?: number
  caretInset?: number
}): { shift: number; caret: number } {
  const width = Math.max(0, hostWidth)
  const dock = Math.max(0, Math.min(dockWidth, width || dockWidth))
  const x = clampMarkValue(anchorRatio, 0, 1) * width
  const maxShift = Math.max(edge, width - dock - edge)
  const shift = clampMarkValue(x - dock / 2, edge, maxShift)
  const caret = clampMarkValue(x - shift, caretInset, Math.max(caretInset, dock - caretInset))
  return { shift, caret }
}
