import { describe, expect, it } from 'vitest'
import { COUNTRY_DELIMITER, getCountryCode, parseCountries, serializeCountries } from './country'

describe('api country helpers', () => {
  it('parses and serializes country names with the shared delimiter', () => {
    const stored = serializeCountries(['United States', 'Japan'])
    expect(stored).toContain(COUNTRY_DELIMITER)
    expect(parseCountries(stored)).toEqual(['United States', 'Japan'])
  })

  it('resolves ISO codes for known country names', () => {
    expect(getCountryCode('Japan')).toBe('JP')
    expect(getCountryCode('United States')).toBe('US')
    expect(getCountryCode('England')).toBe('gb-eng')
    expect(getCountryCode('Scotland')).toBe('gb-sct')
    expect(getCountryCode('Wales')).toBe('gb-wls')
    expect(getCountryCode('Northern Ireland')).toBe('GB')
    expect(getCountryCode('Not A Country')).toBe('')
  })

  it('splits delimited stored values without filtering unknowns', () => {
    expect(parseCountries(`Japan${COUNTRY_DELIMITER}Atlantis`)).toEqual(['Japan', 'Atlantis'])
  })
})
