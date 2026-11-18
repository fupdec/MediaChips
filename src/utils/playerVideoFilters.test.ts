import {describe, expect, it} from 'vitest'
import {
  createDefaultPlayerFilters,
  gammaExponent,
  isDefaultPlayerFilters,
  playerFilterCss,
  sharpenKernel,
} from './playerVideoFilters'

describe('playerVideoFilters', () => {
  it('produces no filter for the defaults', () => {
    const filters = createDefaultPlayerFilters()
    expect(isDefaultPlayerFilters(filters)).toBe(true)
    expect(playerFilterCss(filters)).toBe('')
  })

  it('builds the CSS filter chain only from changed values', () => {
    const filters = {...createDefaultPlayerFilters(), brightness: 1.2, hue: -30, preset: 'sepia' as const}
    expect(isDefaultPlayerFilters(filters)).toBe(false)
    expect(playerFilterCss(filters)).toBe('brightness(1.2) hue-rotate(-30deg) sepia(1)')
  })

  it('references the SVG gamma filter only when gamma is changed', () => {
    expect(playerFilterCss({...createDefaultPlayerFilters(), gamma: 1.5})).toBe('url(#mc-player-gamma)')
  })

  it('inverts gamma into the feFuncX exponent', () => {
    expect(gammaExponent(2)).toBe(0.5)
    expect(gammaExponent(1)).toBe(1)
    expect(gammaExponent(0)).toBe(1)
  })
})

describe('sharpen and blur', () => {
  it('builds an identity kernel at zero and a unit-sum kernel otherwise', () => {
    expect(sharpenKernel(0)).toBe('0 0 0 0 1 0 0 0 0')
    expect(sharpenKernel(0.5)).toBe('0 -0.5 0 -0.5 3 -0.5 0 -0.5 0')
  })

  it('adds blur and the sharpen filter to the CSS only when used', () => {
    expect(playerFilterCss(createDefaultPlayerFilters())).toBe('')
    expect(playerFilterCss({...createDefaultPlayerFilters(), blur: 2.5, sharpen: 1})).toBe('blur(2.5px) url(#mc-player-sharpen)')
  })
})
