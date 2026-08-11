import {describe, expect, it} from 'vitest'
import {
  isDefaultTagColor,
  resolveTagChipColor,
  tagChipNeedsContrastText,
  tagChipNeedsOutlinedInk,
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

  it('forces contrast text only on filled chip variants', () => {
    expect(tagChipNeedsContrastText('flat')).toBe(true)
    expect(tagChipNeedsContrastText('elevated')).toBe(true)
    expect(tagChipNeedsContrastText(undefined)).toBe(true)
    expect(tagChipNeedsContrastText('tonal')).toBe(false)
    expect(tagChipNeedsContrastText('outlined')).toBe(false)
    expect(tagChipNeedsContrastText('text')).toBe(false)
    expect(tagChipNeedsContrastText('plain')).toBe(false)
  })

  it('forces outlined ink override only for outlined chips', () => {
    expect(tagChipNeedsOutlinedInk('outlined')).toBe(true)
    expect(tagChipNeedsOutlinedInk('flat')).toBe(false)
    expect(tagChipNeedsOutlinedInk('tonal')).toBe(false)
  })
})
