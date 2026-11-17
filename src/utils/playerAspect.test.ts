import {describe, expect, it} from 'vitest'
import {aspectModeRatio, fitAspectBox} from './playerAspect'

describe('playerAspect', () => {
  it('parses fixed ratios and ignores non-ratio modes', () => {
    expect(aspectModeRatio('16:9')).toBeCloseTo(16 / 9)
    expect(aspectModeRatio('4:3')).toBeCloseTo(4 / 3)
    expect(aspectModeRatio('auto')).toBeNull()
    expect(aspectModeRatio('stretch')).toBeNull()
  })

  it('fits the box by the limiting side', () => {
    expect(fitAspectBox(1000, 1000, 16 / 9)).toEqual({width: 1000, height: 562})
    expect(fitAspectBox(2000, 600, 4 / 3)).toEqual({width: 800, height: 600})
    expect(fitAspectBox(0, 600, 4 / 3)).toBeNull()
  })
})
