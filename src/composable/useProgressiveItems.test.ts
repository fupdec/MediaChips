import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {effectScope, nextTick, ref, type EffectScope} from 'vue'
import {useProgressiveItems} from './useProgressiveItems'

let scopes: EffectScope[] = []
let frames: Map<number, FrameRequestCallback>
let frameId = 0
beforeEach(() => {
  vi.useFakeTimers()
  frames = new Map()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback)
    return frameId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
})
afterEach(() => {
  scopes.forEach(scope => scope.stop())
  scopes = []
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
function setup(length = 8) {
  const source = ref(Array.from({length}, (_, id) => ({id})))
  const key = ref(0)
  const scope = effectScope()
  scopes.push(scope)
  const state = scope.run(() => useProgressiveItems(source, key))!
  return {source, key, scope, ...state}
}
async function paintBatch() {
  const [id, callback] = [...frames][0]
  frames.delete(id)
  callback(0)
  await vi.advanceTimersByTimeAsync(0)
}
describe('progressive card rendering', () => {
  it('mounts only three cards initially and yields between batches', async () => {
    const state = setup()
    expect(state.renderedItems.value).toHaveLength(3)
    expect(state.isRendering.value).toBe(true)
    await paintBatch()
    expect(state.renderedItems.value).toHaveLength(6)
    await paintBatch()
    expect(state.renderedItems.value).toHaveLength(8)
    expect(state.isRendering.value).toBe(false)
    expect(frames.size).toBe(0)
  })
  it('retains rendered cards on append and handles an in-place append', async () => {
    const state = setup(3)
    const first = state.renderedItems.value[0]
    state.source.value.push(...[{id: 3}, {id: 4}, {id: 5}, {id: 6}])
    await nextTick()
    expect(state.renderedItems.value).toHaveLength(3)
    expect(state.renderedItems.value[0]).toBe(first)
    await paintBatch()
    expect(state.renderedItems.value).toHaveLength(6)
  })
  it('cancels stale batches when a sorted or filtered list replaces the previous list', async () => {
    const state = setup(10)
    await paintBatch()
    state.source.value = Array.from({length: 5}, (_, index) => ({id: 100 + index}))
    await nextTick()
    expect(state.renderedItems.value.map(item => item.id)).toEqual([100, 101, 102])
    expect(frames.size).toBe(1)
    await paintBatch()
    expect(state.renderedItems.value.map(item => item.id)).toEqual([100, 101, 102, 103, 104])
  })
  it('resets the render budget when the grid is remounted and cancels work on disposal', async () => {
    const state = setup(10)
    await paintBatch()
    state.key.value++
    await nextTick()
    expect(state.renderedItems.value).toHaveLength(3)
    const [id, callback] = [...frames][0]
    frames.delete(id)
    callback(0)
    state.scope.stop()
    await vi.runAllTimersAsync()
    expect(state.renderedItems.value).toHaveLength(3)
    expect(frames.size).toBe(0)
  })
})
