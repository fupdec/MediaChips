import {describe, expect, it} from 'vitest'
import {
  normalizeGenderFilter,
  passesGenderFilter,
} from './faceGender'

describe('faceGender filter helpers', () => {
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
})
