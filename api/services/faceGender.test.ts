import {describe, expect, it} from 'vitest'
import {
  GENDER_MIN_CONFIDENCE,
  normalizeGenderFilter,
  passesGenderFilter,
} from './faceGender'

describe('faceGender re-exports filter helpers', () => {
  it('keeps the public filter API stable', () => {
    expect(normalizeGenderFilter('female')).toBe('female')
    expect(passesGenderFilter('male', 'female', GENDER_MIN_CONFIDENCE)).toBe(false)
  })
})
