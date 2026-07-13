import { describe, expect, it } from 'vitest'
import {
  buildScraperTransferFields,
  formatScraperAliases,
  mergeSynonymValues,
  resolveCountryName,
  synonymsAlreadyContain,
} from '@/utils/scraperTransferFields'

describe('scraperTransferFields', () => {
  it('builds country and synonyms transfer fields from scraper payload', () => {
    const fields = buildScraperTransferFields({
      selected: {
        name: 'Angela White',
        aliases: ['Angie', 'Angela White', 'Angela'],
        extras: {
          birthplace_code: 'AU',
          nationality: 'Australian',
        },
      },
      pinned: [],
      currentValues: {
        country: [],
        synonyms: 'Angie',
      },
      tags: [],
    })

    expect(fields).toHaveLength(2)

    const country = fields.find((field) => field.key === 'country')
    expect(country?.valueScraper).toEqual(['Australia'])

    const synonyms = fields.find((field) => field.key === 'synonyms')
    expect(synonyms?.valueScraper).toBe('Angie, Angela')
    expect(synonyms?.isAlreadyContain).toBe(false)
  })

  it('resolves country from nationality when birthplace code is missing', () => {
    expect(resolveCountryName({ nationality: 'Australia' })).toBe('Australia')
    expect(resolveCountryName({ nationality: 'Unknownland' })).toBe('Unknownland')
  })

  it('formats aliases without the performer name', () => {
    expect(formatScraperAliases(['Angela White', 'Angie'], 'Angela White')).toBe('Angie')
  })

  it('merges synonym values without duplicates', () => {
    expect(mergeSynonymValues('Angie', 'Angela, Angie')).toBe('Angie, Angela')
    expect(synonymsAlreadyContain('Angie, Angela', 'Angela')).toBe(true)
    expect(synonymsAlreadyContain('Angie', 'Angela')).toBe(false)
  })
})
