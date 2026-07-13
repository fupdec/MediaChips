import { describe, expect, it } from 'vitest'
import { areScraperValuesEqual } from './scraperValueCompare'

describe('areScraperValuesEqual', () => {
  it('matches scalar text and numeric values', () => {
    expect(areScraperValuesEqual('2001-07-26', '2001-07-26')).toBe(true)
    expect(areScraperValuesEqual(175, '175')).toBe(true)
    expect(areScraperValuesEqual('38', 'NN')).toBe(false)
  })

  it('matches array tag values', () => {
    expect(areScraperValuesEqual(['Caucasian'], 'Caucasian', 'array')).toBe(true)
    expect(areScraperValuesEqual(['Natural'], 'NN', 'array')).toBe(false)
  })

  it('matches country lists', () => {
    expect(
      areScraperValuesEqual(['United States'], ['United States'], 'country'),
    ).toBe(true)
    expect(
      areScraperValuesEqual(['Russia'], ['United States'], 'country'),
    ).toBe(false)
  })
})
