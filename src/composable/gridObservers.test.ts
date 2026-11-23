import {afterEach, describe, expect, it, vi} from 'vitest'
import {computed, createApp, h, nextTick, ref} from 'vue'
import {useResponsiveGridLayout} from './useResponsiveGridLayout'
import {useLazyInView} from './useLazyInView'
import {useVirtualMasonryWindow} from './useVirtualMasonryWindow'

const visibility = vi.hoisted(() => ({callback: undefined as undefined | ((visible: boolean) => void)}))
vi.mock('@/utils/sharedVisibilityObserver', () => ({
  observeVisibility: vi.fn((_el, callback) => {visibility.callback = callback}),
  unobserveVisibility: vi.fn(),
}))

let cleanup = () => {}
afterEach(() => {cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks()})

describe('grid observers without forced layout', () => {
  it('takes container width from ResizeObserver without reading clientWidth on mount', async () => {
    let resize!: ResizeObserverCallback
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) {resize = callback}
      observe = vi.fn()
      disconnect = disconnect
    })
    const host = document.createElement('div')
    const widthRead = vi.spyOn(Element.prototype, 'clientWidth', 'get')
    let grid!: ReturnType<typeof useResponsiveGridLayout>
    const app = createApp({setup() {
      const target = ref<HTMLElement | null>(null)
      grid = useResponsiveGridLayout(target, computed(() => ({size: 3, imageGrid: true})))
      return () => h('div', {ref: target})
    }})
    app.mount(host)
    cleanup = () => app.unmount()
    await nextTick()
    const el = host.firstElementChild as HTMLElement
    expect(widthRead).not.toHaveBeenCalled()
    resize([{target: el, contentRect: {width: 960}} as ResizeObserverEntry], {} as ResizeObserver)
    expect(grid.containerWidth.value).toBe(960)
    app.unmount()
    cleanup = () => {}
    expect(disconnect).toHaveBeenCalled()
  })

  it('lets IntersectionObserver establish initial visibility without measuring each card', async () => {
    const host = document.createElement('div')
    const boundsRead = vi.spyOn(Element.prototype, 'getBoundingClientRect')
    let state!: ReturnType<typeof useLazyInView>
    const app = createApp({setup() {
      const target = ref<HTMLElement | null>(null)
      state = useLazyInView(target)
      return () => h('div', {ref: target})
    }})
    app.mount(host)
    cleanup = () => app.unmount()
    await nextTick()
    expect(boundsRead).not.toHaveBeenCalled()
    visibility.callback!(true)
    expect(state.isInView.value).toBe(true)
    expect(state.wasInView.value).toBe(true)
    visibility.callback!(false)
    expect(state.isInView.value).toBe(false)
    expect(state.wasInView.value).toBe(true)
  })
  it('does not measure or bind scrolling for disabled masonry virtualization', async () => {
    const host = document.createElement('div')
    const widthRead = vi.spyOn(Element.prototype, 'clientWidth', 'get')
    const addListener = vi.spyOn(Element.prototype, 'addEventListener')
    const app = createApp({setup() {
      const target = ref<HTMLElement | null>(null)
      useVirtualMasonryWindow(computed(() => []), target, ref({size: 3, gapSize: 'xs'}), ref(false))
      return () => h('div', {ref: target})
    }})
    app.mount(host)
    cleanup = () => app.unmount()
    await nextTick()
    await nextTick()
    expect(widthRead).not.toHaveBeenCalled()
    expect(addListener.mock.calls.some(call => call[0] === 'scroll')).toBe(false)
  })

})
