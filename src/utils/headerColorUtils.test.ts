import {describe, expect, it} from 'vitest'
import {
  checkColorForDarkText,
  hexToRgba,
  isNearWhiteColor,
  parseHexRgb,
} from '@/utils/headerColorUtils'

describe('headerColorUtils', () => {
  it('expands 3-digit hex when parsing', () => {
    expect(parseHexRgb('#fff')).toEqual({r: 255, g: 255, b: 255})
    expect(parseHexRgb('#f00')).toEqual({r: 255, g: 0, b: 0})
    expect(parseHexRgb('#ffffff')).toEqual({r: 255, g: 255, b: 255})
  })

  it('detects dark text on light header colors', () => {
    expect(checkColorForDarkText('#ffffff')).toBe(false)
    expect(checkColorForDarkText('#fff')).toBe(false)
    expect(checkColorForDarkText('#111111')).toBe(true)
    expect(checkColorForDarkText('#f00')).toBe(true)
  })

  it('flags near-white fills that vanish on light surfaces', () => {
    expect(isNearWhiteColor('#fff')).toBe(true)
    expect(isNearWhiteColor('#ffffff')).toBe(true)
    expect(isNearWhiteColor('#f5f5f5')).toBe(true)
    expect(isNearWhiteColor('#e91e63')).toBe(false)
    expect(isNearWhiteColor('#111111')).toBe(false)
  })

  it('builds modern rgb opacity strings from short and long hex', () => {
    expect(hexToRgba('#ff0000', 60)).toBe('rgb(255 0 0 / 60%)')
    expect(hexToRgba('#f00', 60)).toBe('rgb(255 0 0 / 60%)')
  })
})
