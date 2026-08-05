import {describe, expect, it} from 'vitest'
import {COUNTRY_DELIMITER, parseCountries, serializeCountries} from './country'

describe('shared/country', () => {
  it('parses delimited and legacy comma lists with known names', () => {
    expect(parseCountries(`A${COUNTRY_DELIMITER}B`)).toEqual(['A', 'B'])
    expect(parseCountries('United States,Canada', ['United States', 'Canada'])).toEqual([
      'United States',
      'Canada',
    ])
    expect(parseCountries(null)).toEqual([])
  })

  it('serializes arrays and passthrough strings', () => {
    expect(serializeCountries(['A', 'B'])).toBe(`A${COUNTRY_DELIMITER}B`)
    expect(serializeCountries('A')).toBe('A')
    expect(serializeCountries([])).toBeNull()
  })
})
