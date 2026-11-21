import {afterEach, describe, expect, it} from 'vitest'
import {computed, createApp, h, nextTick, ref} from 'vue'
import {useVirtualGridWindow} from './useVirtualGridWindow'

describe('virtual grid updates', () => {
  let cleanup = () => {}
  afterEach(() => cleanup())

  it('retains unchanged rows and publishes replacement items', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const items = ref(Array.from({length: 30}, (_, id) => ({id})))
    let grid!: ReturnType<typeof useVirtualGridWindow<{id: number}>>
    const app = createApp({
      setup() {
        const el = ref<HTMLElement | null>(null)
        grid = useVirtualGridWindow(computed(() => items.value), el, computed(() => ({
          size: 3, gapSize: 'default', imageGrid: true, wideImage: false,
          lineGrid: false, chipsGrid: false, lockRowHeight: true,
        })))
        return () => h('div', {ref: el})
      },
    })
    app.mount(host)
    cleanup = () => { app.unmount(); host.remove() }
    await nextTick()
    grid.updateWindow(false)
    const rows = grid.visibleRows.value
    expect(rows.length).toBeGreaterThan(0)
    grid.updateWindow(false)
    expect(grid.visibleRows.value).toBe(rows)
    items.value = [{id: 100}, ...items.value.slice(1)]
    await nextTick()
    grid.updateWindow(false)
    expect(grid.visibleRows.value).not.toBe(rows)
    expect(grid.visibleRows.value[0].items[0].id).toBe(100)
    expect(grid.visibleRows.value[1]).toBe(rows[1])
  })
})
