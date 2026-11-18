import {describe, expect, it, vi} from 'vitest'
import {
  createAbLoop,
  cycleAbLoop,
  formatLoopTime,
  isAbLoopActive,
  loopJumpTarget,
  nextAbLoop,
  type AbLoopStoreLike,
} from './playerAbLoop'

const t = (key: string) => `<${key}>`

describe('playerAbLoop', () => {
  it('cycles A, B and off', () => {
    const a = nextAbLoop(createAbLoop(), 10)
    expect(a).toEqual({a: 10, b: null})
    const ab = nextAbLoop(a, 25)
    expect(ab).toEqual({a: 10, b: 25})
    expect(isAbLoopActive(ab)).toBe(true)
    expect(nextAbLoop(ab, 30)).toEqual(createAbLoop())
  })

  it('moves A instead of creating a too short loop', () => {
    expect(nextAbLoop({a: 10, b: null}, 10.2)).toEqual({a: 10.2, b: null})
    expect(nextAbLoop({a: 10, b: null}, 4)).toEqual({a: 4, b: null})
  })

  it('jumps back to A only once B is reached', () => {
    const loop = {a: 10, b: 20}
    expect(loopJumpTarget(loop, 19.9)).toBeNull()
    expect(loopJumpTarget(loop, 20)).toBe(10)
    expect(loopJumpTarget(loop, 35)).toBe(10)
    expect(loopJumpTarget({a: 10, b: null}, 99)).toBeNull()
    expect(loopJumpTarget(createAbLoop(), 99)).toBeNull()
  })

  it('formats time like a player clock', () => {
    expect(formatLoopTime(5)).toBe('0:05')
    expect(formatLoopTime(83)).toBe('1:23')
    expect(formatLoopTime(3725)).toBe('1:02:05')
  })

  it('reports each step on screen', () => {
    const store: AbLoopStoreLike = {currentTime: 83, abLoop: createAbLoop(), changePlayerStatusText: vi.fn()}
    cycleAbLoop(store, t)
    expect(store.abLoop).toEqual({a: 83, b: null})
    expect(store.changePlayerStatusText).toHaveBeenCalledWith({
      text: 'A  1:23', icon: 'alpha-a-circle-outline', subtitleKey: 'player.ab_loop_label',
    })
    store.currentTime = 130
    cycleAbLoop(store, t)
    expect(store.changePlayerStatusText).toHaveBeenCalledWith({
      text: 'A 1:23 – B 2:10', icon: 'repeat', subtitleKey: 'player.ab_loop_label',
    })
    cycleAbLoop(store, t)
    expect(store.abLoop).toEqual(createAbLoop())
    expect(store.changePlayerStatusText).toHaveBeenCalledWith({
      text: '<player.ab_loop_off>', icon: 'repeat-off', subtitleKey: 'player.ab_loop_label',
    })
  })
})
