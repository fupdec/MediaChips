import {describe, expect, it} from 'vitest'
import {
  approximateTagColor,
  compareTagColorSwatches,
  normalizeTagColorFilter,
  TAG_COLOR_FILTER_NONE,
  TAG_RAINBOW_COLORS,
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
    expect(a).toBeTruthy()
    expect(approximateTagColor('#ee1111')).toBe(a)
    expect(approximateTagColor('#dd2222')).toBe(a)
    expect(approximateTagColor('#ff5252')).toBe(a)
  })

  it('snaps to rainbow colors only', () => {
    for (const hex of ['#ff0000', '#ffa500', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff69b4', '#009688', '#81d4fa']) {
      expect(TAG_RAINBOW_COLORS).toContain(approximateTagColor(hex))
    }
  })

  it('keeps red and blue in different buckets', () => {
    expect(approximateTagColor('#ff0000')).not.toBe(approximateTagColor('#0000ff'))
  })

  it('merges navy and sky blue into nearby rainbow buckets by hue, not lightness', () => {
    expect(approximateTagColor('#0d47a1')).toBe(approximateTagColor('#2962ff'))
  })

  it('is idempotent for the swatches themselves', () => {
    for (const color of TAG_RAINBOW_COLORS) {
      expect(approximateTagColor(color)).toBe(color)
    }
  })

  it('returns null for colors without a hue', () => {
    expect(approximateTagColor('#fafafa')).toBeNull()
    expect(approximateTagColor('#777777')).toBeNull()
    expect(approximateTagColor('#000000')).toBeNull()
  })

  it('returns null for empty values', () => {
    expect(approximateTagColor(null)).toBeNull()
    expect(approximateTagColor('none')).toBeNull()
    expect(approximateTagColor('')).toBeNull()
  })
})

describe('compareTagColorSwatches', () => {
  it('orders swatches red to violet', () => {
    const shuffled = [...TAG_RAINBOW_COLORS].reverse()
    expect(shuffled.sort(compareTagColorSwatches)).toEqual([...TAG_RAINBOW_COLORS])
  })
})
