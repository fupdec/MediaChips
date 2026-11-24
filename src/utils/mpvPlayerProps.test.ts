import {describe, expect, it} from 'vitest'
import {createDefaultPlayerFilters} from '@/utils/playerVideoFilters'
import {
  buildNativeViewProps,
  diffProps,
  mpvAspectProps,
  mpvAudioFilterChain,
  mpvColorProps,
  mpvVideoFilterChain,
  mpvZoomPanProps,
  sourceFlips,
} from './mpvPlayerProps'

const surface = {width: 1000, height: 500}

describe('mpvAspectProps', () => {
  it('passes fixed ratios and resets the other controls', () => {
    expect(mpvAspectProps('16:9')).toEqual({'video-aspect-override': '16:9', keepaspect: 'yes', panscan: 0})
  })
  it('maps stretch and cover to keepaspect / panscan', () => {
    expect(mpvAspectProps('stretch')).toMatchObject({keepaspect: 'no', panscan: 0})
    expect(mpvAspectProps('cover')).toMatchObject({keepaspect: 'yes', panscan: 1})
  })
  it('returns to the container aspect for auto', () => {
    expect(mpvAspectProps('auto')).toEqual({'video-aspect-override': -1, keepaspect: 'yes', panscan: 0})
  })
})

describe('mpvZoomPanProps', () => {
  it('uses a logarithmic zoom and zero pan when not zoomed', () => {
    expect(mpvZoomPanProps(1, 120, 40, surface)).toEqual({'video-zoom': 0, 'video-pan-x': 0, 'video-pan-y': 0})
    expect(mpvZoomPanProps(2, 0, 0, surface)['video-zoom']).toBe(1)
    expect(mpvZoomPanProps(4, 0, 0, surface)['video-zoom']).toBe(2)
  })
  it('expresses pan as a fraction of the scaled picture', () => {
    const props = mpvZoomPanProps(2, 500, -100, surface)
    expect(props['video-pan-x']).toBe(0.25)
    expect(props['video-pan-y']).toBe(-0.1)
  })
  it('clamps out-of-range zoom', () => {
    expect(mpvZoomPanProps(10, 0, 0, surface)['video-zoom']).toBe(2)
  })
})

describe('sourceFlips', () => {
  it('keeps the axes for 0 and 180 degrees', () => {
    expect(sourceFlips(0, true, false)).toEqual({h: true, v: false})
    expect(sourceFlips(180, true, false)).toEqual({h: true, v: false})
  })
  it('swaps the axes for quarter turns because flips are screen-based', () => {
    expect(sourceFlips(90, true, false)).toEqual({h: false, v: true})
    expect(sourceFlips(270, false, true)).toEqual({h: true, v: false})
  })
})

describe('mpvColorProps', () => {
  it('is neutral for the default filters', () => {
    expect(mpvColorProps(createDefaultPlayerFilters())).toEqual({brightness: 0, contrast: 0, saturation: 0, hue: 0, gamma: 0})
  })
  it('maps CSS-style multipliers to the mpv range', () => {
    const props = mpvColorProps({...createDefaultPlayerFilters(), brightness: 1.5, contrast: 0.5, saturation: 0, hue: 90, gamma: 2})
    expect(props).toEqual({brightness: 50, contrast: -50, saturation: -100, hue: 50, gamma: 100})
  })
  it('forces zero saturation for the grayscale preset', () => {
    expect(mpvColorProps({...createDefaultPlayerFilters(), preset: 'grayscale'}).saturation).toBe(-100)
  })
})

describe('mpvVideoFilterChain', () => {
  const filters = createDefaultPlayerFilters()
  it('is empty when nothing is changed', () => {
    expect(mpvVideoFilterChain(0, false, false, filters)).toBe('')
  })
  it('adds source-space flips', () => {
    expect(mpvVideoFilterChain(0, true, true, filters)).toBe('hflip,vflip')
    expect(mpvVideoFilterChain(90, true, false, filters)).toBe('vflip')
  })
  it('combines sharpen, blur and presets in one lavfi chain', () => {
    const chain = mpvVideoFilterChain(0, false, false, {...filters, sharpen: 1.2, blur: 2, preset: 'invert'})
    expect(chain).toBe('lavfi=[unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount=1.2,gblur=sigma=2,negate]')
  })
  it('implements sepia with a channel mixer', () => {
    expect(mpvVideoFilterChain(0, false, false, {...filters, preset: 'sepia'})).toContain('colorchannelmixer=.393')
  })
})

describe('mpvAudioFilterChain', () => {
  it('clears the chain for a flat curve', () => {
    expect(mpvAudioFilterChain([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe('')
  })
  it('emits one equalizer per non-flat band', () => {
    expect(mpvAudioFilterChain([6, 0, 0, 0, 0, 0, 0, 0, 0, -3.5]))
      .toBe('lavfi=[equalizer=f=31:t=o:w=1:g=6,equalizer=f=16000:t=o:w=1:g=-3.5]')
  })
})

describe('diffProps', () => {
  it('returns everything on the first call and only changes afterwards', () => {
    const first = buildNativeViewProps({
      aspectMode: 'auto', rotation: 0, flipH: false, flipV: false, zoom: 1, panX: 0, panY: 0, surface,
      filters: createDefaultPlayerFilters(), equalizerGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    })
    expect(diffProps(null, first)).toBe(first)
    const second = {...first, 'video-rotate': 90}
    expect(diffProps(first, second)).toEqual({'video-rotate': 90})
    expect(diffProps(second, second)).toEqual({})
  })
})
