import {describe, expect, it} from 'vitest'
import {
  SCRAPER_PERFORMER_GENDER_ANY,
  normalizeApiPerformerGender,
  normalizeScraperPerformerGender,
  performerMatchesGenderFilter,
  resolveScraperPerformerGenderParam,
} from './scraperPerformerGender'

describe('scraperPerformerGender', () => {
  it('keeps supported gender values', () => {
    expect(normalizeScraperPerformerGender('Male')).toBe('Male')
    expect(normalizeScraperPerformerGender('Female')).toBe('Female')
    expect(resolveScraperPerformerGenderParam('Male')).toBe('Male')
  })

  it('treats empty or unknown values as any gender', () => {
    expect(normalizeScraperPerformerGender('')).toBe(SCRAPER_PERFORMER_GENDER_ANY)
    expect(normalizeScraperPerformerGender('Nope')).toBe(SCRAPER_PERFORMER_GENDER_ANY)
    expect(resolveScraperPerformerGenderParam('')).toBeUndefined()
    expect(resolveScraperPerformerGenderParam('Nope')).toBeUndefined()
  })

  it('normalizes GraphQL enum genders', () => {
    expect(normalizeApiPerformerGender('FEMALE')).toBe('Female')
    expect(normalizeApiPerformerGender('TRANSGENDER_MALE')).toBe('Transgender Male')
    expect(normalizeApiPerformerGender('non-binary')).toBe('Non-Binary')
  })

  it('filters performers by selected gender', () => {
    expect(performerMatchesGenderFilter('Female', '')).toBe(true)
    expect(performerMatchesGenderFilter('Male', 'Female')).toBe(false)
    expect(performerMatchesGenderFilter('FEMALE', 'Female')).toBe(true)
    expect(performerMatchesGenderFilter(undefined, 'Female')).toBe(false)
  })
})
