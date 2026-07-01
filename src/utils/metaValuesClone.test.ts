import {describe, expect, it} from 'vitest'
import {
  cloneMetaFieldValue,
  cloneMetaValues,
  metaArrayValuesEqual,
} from '@/utils/metaValuesClone'

describe('metaValuesClone', () => {
  it('clones array fields without sharing references', () => {
    const values = {
      country: ['US', 'CA'],
      tags: [1, 2, 3],
      name: 'test',
      rating: 4,
    }

    const cloned = cloneMetaValues(values)
    expect(cloned).toEqual(values)
    expect(cloned.country).not.toBe(values.country)
    expect(cloned.tags).not.toBe(values.tags)

    ;(cloned.country as string[]).push('MX')
    expect(values.country).toEqual(['US', 'CA'])
  })

  it('clones primitive field values as-is', () => {
    expect(cloneMetaFieldValue('foo')).toBe('foo')
    expect(cloneMetaFieldValue(0)).toBe(0)
    expect(cloneMetaFieldValue(null)).toBe(null)
  })

  it('compares array meta values regardless of order', () => {
    expect(metaArrayValuesEqual([3, 1, 2], [1, 2, 3])).toBe(true)
    expect(metaArrayValuesEqual([1, 2], [1, 3])).toBe(false)
  })
})
