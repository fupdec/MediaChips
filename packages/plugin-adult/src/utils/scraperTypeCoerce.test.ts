import { describe, expect, it } from 'vitest'
import {
  coerceScraperValueToMetaType,
  getScraperFieldType,
  isScraperMetaTypeCompatible,
} from './scraperTypeCoerce'

describe('scraperTypeCoerce', () => {
  it('resolves scraper field template types', () => {
    expect(getScraperFieldType('height')).toBe('number')
    expect(getScraperFieldType('cupsize')).toBe('array')
    expect(getScraperFieldType('birthday')).toBe('date')
    expect(getScraperFieldType('unknown')).toBeNull()
  })

  it('requires meta type to match scraper field type', () => {
    expect(isScraperMetaTypeCompatible('height', 'number')).toBe(true)
    expect(isScraperMetaTypeCompatible('height', 'string')).toBe(false)
    expect(isScraperMetaTypeCompatible('cupsize', 'array')).toBe(true)
    expect(isScraperMetaTypeCompatible('cupsize', 'number')).toBe(false)
  })

  it('coerces number values and rejects non-numeric input', () => {
    expect(coerceScraperValueToMetaType('175cm', 'number')).toBe('175')
    expect(coerceScraperValueToMetaType('75.4', 'number')).toBe('75')
    expect(coerceScraperValueToMetaType('abc', 'number')).toBeNull()
    expect(coerceScraperValueToMetaType('', 'number')).toBeNull()
  })

  it('keeps array/string values when types match', () => {
    expect(coerceScraperValueToMetaType('Blonde', 'array')).toBe('Blonde')
    expect(coerceScraperValueToMetaType('note', 'string')).toBe('note')
  })
})
