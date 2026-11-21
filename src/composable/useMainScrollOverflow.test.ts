import {afterEach, describe, expect, it, vi} from 'vitest'
import {createApp, h, nextTick, ref} from 'vue'
import {useMainScrollOverflow} from './useMainScrollOverflow'
let cleanup = () => {}
afterEach(() => {cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks()})
describe('observed scroll overflow', () => {
  it('updates from viewport/content sizes without synchronous geometry reads', async () => {
    let notify!: ResizeObserverCallback
    const disconnect = vi.fn()
    const observe = vi.fn()
    const constructor = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) {notify = callback; constructor()}
      observe = observe
      disconnect = disconnect
    })
    const root = document.createElement('div')
    root.className = 'main-scroll'
    root.innerHTML = '<div class="main-scroll-inner"></div>'
    document.body.append(root)
    const inner = root.firstElementChild!
    const scrollRead = vi.spyOn(Element.prototype, 'scrollHeight', 'get')
    const viewportRead = vi.spyOn(Element.prototype, 'clientHeight', 'get')
    const count = ref(0)
    let state!: ReturnType<typeof useMainScrollOverflow>
    const app = createApp({setup() {
      state = useMainScrollOverflow({watchSources: [count]})
      return () => h('span')
    }})
    app.mount(inner)
    cleanup = () => {app.unmount(); root.remove()}
    const send = (target: Element, height: number) => notify([{
      target, contentRect: {height}, borderBoxSize: [{blockSize: height}],
    } as unknown as ResizeObserverEntry], {} as ResizeObserver)
    send(root, 600)
    send(inner, 900)
    expect(state.mainScrollOverflowing.value).toBe(true)
    send(inner, 500)
    expect(state.mainScrollOverflowing.value).toBe(false)
    count.value++
    await nextTick()
    expect(constructor).toHaveBeenCalledTimes(1)
    expect(scrollRead).not.toHaveBeenCalled()
    expect(viewportRead).not.toHaveBeenCalled()
    app.unmount()
    expect(disconnect).toHaveBeenCalled()
    root.remove()
    cleanup = () => {}
  })
})
