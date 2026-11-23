import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createApp, nextTick, ref} from 'vue'
import {getMainScrollEl} from '@/utils/mainScroll'
import {useInfiniteWindowSeek} from './useInfiniteWindowSeek'

vi.mock('@/utils/mainScroll', () => ({getMainScrollEl: vi.fn()}))
vi.mock('@/utils/gridLayout', () => ({getLayoutTopInScroll: () => 0}))
// These lifecycle tests seek above the loaded window, independently of the far-down threshold.
vi.mock('@/composable/useItemsPage', () => ({INFINITE_JUMP_DEBOUNCE_MS: 120, shouldJumpInfiniteWindow: () => false}))

const cleanups: Array<() => void> = []
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks() })
afterEach(() => {
  cleanups.splice(0).forEach(fn => fn())
  vi.restoreAllMocks()
  vi.useRealTimers()
})
function setup(initialEnabled = true) {
  const scroll = document.createElement('div')
  Object.defineProperty(scroll, 'clientHeight', {value: 200})
  vi.mocked(getMainScrollEl).mockReturnValue(scroll)
  const grid = document.createElement('div')
  grid.dataset.rowHeight = '100'
  grid.dataset.columnCount = '4'
  const enabled = ref(initialEnabled)
  const busy = ref(false)
  const window = {start: 100, loaded: 20, total: 1000}
  const jump = vi.fn(async (_index: number) => false)
  let api!: ReturnType<typeof useInfiniteWindowSeek>
  const app = createApp({setup() {
    api = useInfiniteWindowSeek({gridRef: ref(grid), enabled: () => enabled.value,
      getWindow: () => window, isBusy: () => busy.value, jump})
    return () => null
  }})
  app.mount(document.createElement('div'))
  cleanups.push(() => app.unmount())
  return {scroll, enabled, busy, window, jump, api}
}
function deferred() {
  let resolve!: (value: boolean) => void
  const promise = new Promise<boolean>(done => { resolve = done })
  return {promise, resolve}
}
async function flush(ms = 0) { await nextTick(); await vi.advanceTimersByTimeAsync(ms) }

describe('infinite grid seek lifecycle', () => {
  it('debounces scrolling and jumps to the viewport midpoint', async () => {
    const {scroll, jump} = setup()
    scroll.dispatchEvent(new Event('scroll'))
    await flush(60)
    scroll.dispatchEvent(new Event('scroll'))
    await flush(119)
    expect(jump).not.toHaveBeenCalled()
    await flush(1)
    expect(jump).toHaveBeenCalledExactlyOnceWith(4)
  })

  it('does not schedule another evaluation after an in-flight jump finishes on disposal', async () => {
    const pending = deferred()
    const {jump, api} = setup()
    jump.mockReturnValueOnce(pending.promise)
    api.evaluate()
    await flush()
    cleanups.pop()!()
    pending.resolve(true)
    await flush()
    expect(vi.getTimerCount()).toBe(0)
    api.evaluate()
    expect(vi.getTimerCount()).toBe(0)
    expect(jump).toHaveBeenCalledTimes(1)
  })

  it('does not restart old work after disabling and re-enabling the grid', async () => {
    const pending = deferred()
    const {jump, enabled, api} = setup()
    jump.mockReturnValueOnce(pending.promise)
    api.evaluate()
    await flush()
    enabled.value = false
    await nextTick()
    enabled.value = true
    await nextTick()
    pending.resolve(true)
    await flush()
    expect(vi.getTimerCount()).toBe(0)
    expect(jump).toHaveBeenCalledTimes(1)
  })

  it('handles failed jumps and allows the next scroll to retry', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const {jump, api, scroll} = setup()
    jump.mockRejectedValueOnce(new Error('offline'))
    api.evaluate()
    await flush()
    expect(warning).toHaveBeenCalledTimes(1)
    scroll.dispatchEvent(new Event('scroll'))
    await flush(120)
    expect(jump).toHaveBeenCalledTimes(2)
  })

  it('gives a new scroll its own retry budget after busy retries run out', async () => {
    const {busy, jump, api, scroll} = setup()
    busy.value = true
    api.evaluate()
    await flush(6200)
    expect(jump).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    scroll.dispatchEvent(new Event('scroll'))
    await flush(120)
    expect(vi.getTimerCount()).toBe(1)
    busy.value = false
    await flush(150)
    expect(jump).toHaveBeenCalledTimes(1)
  })

  it('does not attach a scroll listener while disabled and removes it on disposal', async () => {
    const {enabled, scroll, jump} = setup(false)
    scroll.dispatchEvent(new Event('scroll'))
    await flush(200)
    expect(vi.getTimerCount()).toBe(0)
    enabled.value = true
    await nextTick()
    scroll.dispatchEvent(new Event('scroll'))
    await flush(120)
    expect(jump).toHaveBeenCalledTimes(1)
    cleanups.pop()!()
    scroll.dispatchEvent(new Event('scroll'))
    await flush(120)
    expect(jump).toHaveBeenCalledTimes(1)
  })
})
