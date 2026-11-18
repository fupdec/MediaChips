import {describe, expect, it, vi} from 'vitest'
import {
  aspectModeLabel,
  cycleAspectMode,
  flipPicture,
  nextAspectMode,
  zoomPicture,
  resetPicture,
  rotatePicture,
  type PictureStoreLike,
} from './playerPictureActions'
import {createDefaultPlayerFilters} from './playerVideoFilters'

const t = (key: string) => `<${key}>`

function createStore(): PictureStoreLike {
  return {
    aspectMode: 'auto',
    rotation: 0,
    flipH: false,
    flipV: false,
    zoom: 1,
    panX: 0,
    panY: 0,
    videoFilters: createDefaultPlayerFilters(),
    changePlayerStatusText: vi.fn(),
  }
}

describe('playerPictureActions', () => {
  it('cycles aspect modes forward and backward with wrap-around', () => {
    expect(nextAspectMode('auto')).toBe('4:3')
    expect(nextAspectMode('cover')).toBe('auto')
    expect(nextAspectMode('auto', -1)).toBe('cover')
  })

  it('labels named modes through i18n and ratios as is', () => {
    expect(aspectModeLabel('auto', t)).toBe('<player.aspect_ratio_auto>')
    expect(aspectModeLabel('16:9', t)).toBe('16:9')
  })

  it('shows the new aspect mode on screen', () => {
    const store = createStore()
    cycleAspectMode(store, t)
    expect(store.aspectMode).toBe('4:3')
    expect(store.changePlayerStatusText).toHaveBeenCalledWith({
      text: '4:3', icon: 'aspect-ratio', subtitleKey: 'player.aspect_ratio_label',
    })
  })

  it('rotates by quarter turns and reports the angle', () => {
    const store = createStore()
    rotatePicture(store, -90)
    expect(store.rotation).toBe(270)
    expect(store.changePlayerStatusText).toHaveBeenCalledWith({
      text: '270°', icon: 'rotate-left', subtitleKey: 'player.orientation_label',
    })
  })

  it('toggles flips independently', () => {
    const store = createStore()
    flipPicture(store, 'h', t)
    flipPicture(store, 'v', t)
    flipPicture(store, 'v', t)
    expect([store.flipH, store.flipV]).toEqual([true, false])
  })

  it('resets aspect, orientation and colour filters', () => {
    const store = createStore()
    store.aspectMode = '16:9'
    store.rotation = 90
    store.flipH = true
    store.zoom = 2
    store.panX = 40
    store.videoFilters.brightness = 1.4
    resetPicture(store, t)
    expect([store.zoom, store.panX, store.panY]).toEqual([1, 0, 0])
    expect(store.aspectMode).toBe('auto')
    expect(store.rotation).toBe(0)
    expect(store.flipH).toBe(false)
    expect(store.videoFilters).toEqual(createDefaultPlayerFilters())
  })

  it('zooms in steps, reports it and drops the pan at 100%', () => {
    const store = createStore()
    zoomPicture(store, 1)
    expect(store.zoom).toBe(1.25)
    expect(store.changePlayerStatusText).toHaveBeenCalledWith({
      text: '125%', icon: 'magnify-plus-outline', subtitleKey: 'player.zoom_label',
    })
    store.panX = 30
    zoomPicture(store, -1)
    expect([store.zoom, store.panX]).toEqual([1, 0])
  })
})
