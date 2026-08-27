import {describe, expect, it} from 'vitest'
import {
  approximateTagColor,
  compareTagColorSwatches,
  normalizeTagColorFilter,
  TAG_COLOR_FILTER_NONE,
} from './tagColorFilter'

describe('normalizeTagColorFilter', () => {
  it('returns none for the no-color sentinel', () => {
    expect(normalizeTagColorFilter('none')).toBe(TAG_COLOR_FILTER_NONE)
    expect(normalizeTagColorFilter('NONE')).toBe(TAG_COLOR_FILTER_NONE)
  })

  it('lowercases hex colors', () => {
    expect(normalizeTagColorFilter('#FF0000')).toBe('#ff0000')
    expect(normalizeTagColorFilter('  #AbC  ')).toBe('#abc')
  })

  it('rejects empty and invalid values', () => {
    expect(normalizeTagColorFilter(null)).toBeNull()
    expect(normalizeTagColorFilter('')).toBeNull()
    expect(normalizeTagColorFilter('red')).toBeNull()
    expect(normalizeTagColorFilter('#gg0000')).toBeNull()
  })
})

describe('approximateTagColor', () => {
  it('collapses nearby reds into one bucket', () => {
    const a = approximateTagColor('#ff0000')
    const b = approximateTagColor('#ee1111')
    const c = approximateTagColor('#dd2222')
    expect(a).toBeTruthy()
    expect(a).toBe(b)
    expect(a).toBe(c)
  })

  it('keeps red and blue in different buckets', () => {
    expect(approximateTagColor('#ff0000')).not.toBe(approximateTagColor('#0000ff'))
  })

  it('keeps navy and sky blue apart by lightness', () => {
    const navy = approximateTagColor('#0d47a1')
    const sky = approximateTagColor('#81d4fa')
    expect(navy).toBeTruthy()
    expect(sky).toBeTruthy()
    expect(navy).not.toBe(sky)
  })

  it('maps near-white and gray separately from chromatic colors', () => {
    expect(approximateTagColor('#fafafa')).toBe('#f2f2f2')
    expect(approximateTagColor('#777777')).not.toBe(approximateTagColor('#ff0000'))
  })

  it('returns null for empty values', () => {
    expect(approximateTagColor(null)).toBeNull()
    expect(approximateTagColor('none')).toBeNull()
    expect(approximateTagColor('')).toBeNull()
  })
})

describe('compareTagColorSwatches', () => {
  it('orders chromatic colors before grayscale', () => {
    const red = approximateTagColor('#ff0000')!
    const gray = approximateTagColor('#777777')!
    expect(compareTagColorSwatches(red, gray)).toBeLessThan(0)
  })
})
