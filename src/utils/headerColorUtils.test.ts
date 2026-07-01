import {describe, expect, it} from 'vitest'
import {checkColorForDarkText, hexToRgba} from '@/utils/headerColorUtils'

describe('headerColorUtils', () => {
  it('detects dark text on light header colors', () => {
    expect(checkColorForDarkText('#ffffff')).toBe(false)
    expect(checkColorForDarkText('#111111')).toBe(true)
  })

  it('builds modern rgb opacity strings', () => {
    expect(hexToRgba('#ff0000', 60)).toBe('rgb(255 0 0 / 60%)')
  })
})
