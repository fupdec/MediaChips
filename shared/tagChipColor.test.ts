import {describe, expect, it} from 'vitest'
import {
  isDefaultTagColor,
  resolveTagChipColor,
} from './tagChipColor'

describe('tagChipColor', () => {
  it('treats empty and #777 as default', () => {
    expect(isDefaultTagColor(null)).toBe(true)
    expect(isDefaultTagColor('#777')).toBe(true)
    expect(isDefaultTagColor('#e91e63')).toBe(false)
  })

  it('resolves saved color when colors are enabled', () => {
    expect(resolveTagChipColor(true, '#2196f3')).toBe('#2196f3')
  })

  it('returns undefined when tag has no real color', () => {
    expect(resolveTagChipColor(true, null)).toBeUndefined()
    expect(resolveTagChipColor(true, '#777')).toBeUndefined()
  })

  it('returns undefined when colors are disabled', () => {
    expect(resolveTagChipColor(false, '#2196f3')).toBeUndefined()
  })
})
