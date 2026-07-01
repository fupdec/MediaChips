import {describe, expect, it} from 'vitest'
import {getIconDataType, getTextDataType} from '@/services/metaTypeUtils'

describe('metaTypeUtils', () => {
  it('returns icon for known meta types', () => {
    expect(getIconDataType('array')).toBe('mdi-tag-multiple-outline')
    expect(getIconDataType('rating')).toBe('mdi-star-outline')
  })

  it('prefers i18n labels when available', () => {
    expect(getTextDataType('string', {
      te: (key) => key === 'meta.types.string',
      t: () => 'Localized text',
    })).toBe('Localized text')
  })

  it('falls back to english labels without i18n', () => {
    expect(getTextDataType('boolean')).toBe('Checkbox')
  })
})
