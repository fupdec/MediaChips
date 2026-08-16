import { describe, expect, it } from 'vitest'
import {
  MIN_MARK_DURATION,
  assignMarkLanes,
  clampInspectorDock,
  clampMarkValue,
  collectMarkSnapTargets,
  computeMarkDragDraft,
  computeMarkWheelNudge,
  pxToMarkTime,
  snapMarkTime,
  timeFromTrackClientX,
} from '@/utils/playerMarkStudio'

describe('playerMarkStudio math', () => {
  it('clamps and converts pixels to time', () => {
    expect(clampMarkValue(-2, 0, 10)).toBe(0)
    expect(clampMarkValue(12, 0, 10)).toBe(10)
    expect(pxToMarkTime(50, 100, 200)).toBe(100)
    expect(pxToMarkTime(10, 0, 200)).toBe(0)
  })

  it('maps client X on the track into playback time', () => {
    const rect = { left: 100, width: 200 } as DOMRect
    expect(timeFromTrackClientX(100, rect, 40)).toBe(0)
    expect(timeFromTrackClientX(200, rect, 40)).toBe(20)
    expect(timeFromTrackClientX(500, rect, 40)).toBe(40)
  })

  it('snaps to the nearest target within the window', () => {
    expect(snapMarkTime(10.2, [1, 10, 20])).toEqual({
      value: 10,
      snapped: true,
      target: 10,
    })
    expect(snapMarkTime(10.5, [1, 20], 0.3)).toEqual({
      value: 10.5,
      snapped: false,
      target: null,
    })
  })

  it('collects playhead and other mark edges as snap targets', () => {
    expect(collectMarkSnapTargets(
      [
        { id: 1, time: 5, end: 8 },
        { id: 2, time: 12 },
      ],
      3,
      1,
    )).toEqual([3, 12])
  })

  it('moves a range while preserving duration and clamping', () => {
    const draft = computeMarkDragDraft({
      mode: 'move',
      startTime: 10,
      startEnd: 14,
      deltaTime: 100,
      duration: 20,
      targets: [],
    })
    expect(draft.time).toBe(16)
    expect(draft.end).toBe(20)
    expect(draft.snapTime).toBeNull()
  })

  it('resizes start/end with a minimum duration', () => {
    const start = computeMarkDragDraft({
      mode: 'resize-start',
      startTime: 10,
      startEnd: 14,
      deltaTime: 20,
      duration: 30,
      targets: [],
    })
    expect(start.time).toBe(14 - MIN_MARK_DURATION)
    expect(start.end).toBe(14)

    const end = computeMarkDragDraft({
      mode: 'resize-end',
      startTime: 10,
      startEnd: null,
      deltaTime: 4,
      duration: 30,
      targets: [14],
    })
    expect(end.time).toBe(10)
    expect(end.end).toBe(14)
    expect(end.snapTime).toBe(14)
  })

  it('nudges a mark on wheel, and shift grows the end', () => {
    expect(computeMarkWheelNudge({
      time: 8,
      end: 12,
      delta: -2,
      shiftKey: false,
      duration: 40,
    })).toEqual({ time: 6, end: 10 })

    expect(computeMarkWheelNudge({
      time: 8,
      end: 12,
      delta: 3,
      shiftKey: true,
      duration: 40,
    })).toEqual({ time: 8, end: 15 })

    expect(computeMarkWheelNudge({
      time: 8,
      end: null,
      delta: 1,
      shiftKey: true,
      duration: 40,
    })).toEqual({ time: 8, end: 8 + MIN_MARK_DURATION })
  })

  it('stacks overlapping marks onto extra lanes', () => {
    const layout = assignMarkLanes([
      { id: 1, time: 0, end: 10 },
      { id: 2, time: 5, end: 12 },
      { id: 3, time: 12, end: 18 },
      { id: 4, time: 20 },
    ])
    expect(layout.laneCount).toBe(2)
    expect(layout.lanes.get(1)).toBe(0)
    expect(layout.lanes.get(2)).toBe(1)
    expect(layout.lanes.get(3)).toBe(0)
    expect(layout.lanes.get(4)).toBe(0)
  })

  it('docks the inspector under the mark and keeps the caret on-screen', () => {
    expect(clampInspectorDock({
      hostWidth: 1000,
      dockWidth: 360,
      anchorRatio: 0.5,
    })).toEqual({ shift: 320, caret: 180 })

    const start = clampInspectorDock({
      hostWidth: 1000,
      dockWidth: 360,
      anchorRatio: 0,
      edge: 8,
      caretInset: 16,
    })
    expect(start.shift).toBe(8)
    expect(start.caret).toBe(16)

    const end = clampInspectorDock({
      hostWidth: 1000,
      dockWidth: 360,
      anchorRatio: 1,
      edge: 8,
      caretInset: 16,
    })
    expect(end.shift).toBe(632)
    expect(end.caret).toBe(344)
  })
})
