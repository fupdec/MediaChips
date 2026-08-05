import {describe, expect, it} from 'vitest'
import {
  GENDER_MIN_CONFIDENCE,
  normalizeGenderFilter,
  passesGenderFilter,
  softmax2,
} from './faceGenderFilter'

describe('faceGenderFilter', () => {
  it('normalizes unknown values to both', () => {
    expect(normalizeGenderFilter(undefined)).toBe('both')
    expect(normalizeGenderFilter('')).toBe('both')
    expect(normalizeGenderFilter('ALL')).toBe('both')
    expect(normalizeGenderFilter('Female')).toBe('female')
    expect(normalizeGenderFilter('MALE')).toBe('male')
  })

  it('keeps both genders when filter is both', () => {
    expect(passesGenderFilter('female', 'both')).toBe(true)
    expect(passesGenderFilter('male', 'both')).toBe(true)
    expect(passesGenderFilter(null, 'both')).toBe(true)
  })

  it('filters to the selected gender and keeps unknowns', () => {
    expect(passesGenderFilter('female', 'female')).toBe(true)
    expect(passesGenderFilter('male', 'female')).toBe(false)
    expect(passesGenderFilter(null, 'female')).toBe(true)

    expect(passesGenderFilter('male', 'male')).toBe(true)
    expect(passesGenderFilter('female', 'male')).toBe(false)
    expect(passesGenderFilter(undefined, 'male')).toBe(true)
  })

  it('keeps low-confidence predictions instead of filtering them out', () => {
    expect(passesGenderFilter('male', 'female', GENDER_MIN_CONFIDENCE - 0.01)).toBe(true)
    expect(passesGenderFilter('male', 'female', GENDER_MIN_CONFIDENCE)).toBe(false)
    expect(passesGenderFilter('female', 'female', GENDER_MIN_CONFIDENCE)).toBe(true)
  })

  it('softmax2 normalizes logits', () => {
    const [a, b] = softmax2(0, 0)
    expect(a).toBeCloseTo(0.5, 5)
    expect(b).toBeCloseTo(0.5, 5)
    const [high, low] = softmax2(5, 0)
    expect(high).toBeGreaterThan(low)
    expect(high + low).toBeCloseTo(1, 5)
  })
})
