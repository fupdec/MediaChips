import {describe, expect, it} from 'vitest'
import {parseBooleanSetting} from './parseBooleanSetting'

describe('parseBooleanSetting', () => {
  it('uses fallback for empty values', () => {
    expect(parseBooleanSetting(null, true)).toBe(true)
    expect(parseBooleanSetting('', false)).toBe(false)
  })

  it('accepts boolean, numeric, and string forms', () => {
    expect(parseBooleanSetting(true)).toBe(true)
    expect(parseBooleanSetting(0)).toBe(false)
    expect(parseBooleanSetting(1)).toBe(true)
    expect(parseBooleanSetting('true')).toBe(true)
    expect(parseBooleanSetting('1')).toBe(true)
    expect(parseBooleanSetting('false')).toBe(false)
  })
})
