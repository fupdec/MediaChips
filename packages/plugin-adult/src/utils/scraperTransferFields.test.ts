import { describe, expect, it } from 'vitest'
import {
  bookmarkAlreadyContains,
  buildScraperTransferFields,
  formatScraperAliases,
  mergeBookmarkValues,
  mergeCountryValues,
  mergeSynonymValues,
  resolveCountryName,
  synonymsAlreadyContain,
} from './scraperTransferFields'

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

  it('builds bookmark transfer field from bio and appends to existing text', () => {
    const fields = buildScraperTransferFields({
      selected: {
        bio: 'Award-winning performer.',
      },
      pinned: [],
      currentValues: {
        bookmark: 'My notes',
      },
      tags: [],
    })

    expect(fields).toHaveLength(1)

    const bookmark = fields.find((field) => field.key === 'bio')
    expect(bookmark?.dataType).toBe('bookmark')
    expect(bookmark?.valueScraper).toBe('Award-winning performer.')
    expect(bookmark?.isAlreadyContain).toBe(false)
    expect(mergeBookmarkValues('My notes', bookmark?.valueScraper)).toBe(
      'My notes\n\nAward-winning performer.',
    )
  })

  it('marks bio as already contained when bookmark includes it', () => {
    const fields = buildScraperTransferFields({
      selected: {
        bio: 'Known for comedy roles.',
      },
      pinned: [],
      currentValues: {
        bookmark: 'Notes\n\nKnown for comedy roles.',
      },
      tags: [],
    })

    const bookmark = fields.find((field) => field.key === 'bio')
    expect(bookmark?.isAlreadyContain).toBe(true)
    expect(bookmarkAlreadyContains('Notes\n\nKnown for comedy roles.', 'Known for comedy roles.')).toBe(true)
  })

  it('builds deathday and gender fields from pinned mappings', () => {
    const fields = buildScraperTransferFields({
      selected: {
        extras: {
          deathday: '2020-01-15',
          gender: 'Female',
        },
      },
      pinned: [
        {
          scraper: 'deathday',
          pinnedMetaId: 11,
          meta: { id: 11, type: 'date', name: 'Deathday', icon: 'calendar' },
        },
        {
          scraper: 'gender',
          pinnedMetaId: 12,
          meta: { id: 12, type: 'array', name: 'Gender', icon: 'gender-female' },
        },
      ],
      currentValues: {
        11: null,
        12: [],
      },
      tags: [],
    })

    expect(fields.find((field) => field.key === 'deathday')?.valueScraper).toBe('2020-01-15')
    expect(fields.find((field) => field.key === 'gender')?.valueScraper).toBe('Female')
  })

  it('resolves country from nationality when birthplace code is missing', () => {
    expect(resolveCountryName({ nationality: 'Australia' })).toBe('Australia')
    expect(resolveCountryName({ nationality: 'Unknownland' })).toBe('Unknownland')
  })

  it('resolves country from birthplace when code and nationality are missing', () => {
    expect(resolveCountryName({ birthplace: 'Netherlands' })).toBe('Netherlands')
    expect(resolveCountryName({ birthplace: 'united states' })).toBe('United States')
  })

  it('resolves country from country code alias', () => {
    expect(resolveCountryName({ country: 'nl' })).toBe('Netherlands')
  })

  it('collects country fields from performer root when extras omit them', () => {
    const fields = buildScraperTransferFields({
      selected: {
        extras: {
          gender: 'Female',
        },
        birthplace: 'Netherlands',
      } as never,
      pinned: [],
      currentValues: {
        country: [],
      },
      tags: [],
    })

    const country = fields.find((field) => field.key === 'country')
    expect(country?.valueScraper).toEqual(['Netherlands'])
  })

  it('merges scraped countries without duplicates', () => {
    expect(mergeCountryValues(['United States'], ['Canada', 'United States'])).toEqual([
      'United States',
      'Canada',
    ])
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
