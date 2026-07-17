import {describe, expect, it} from 'vitest'
import {getPerformerScraperFieldTemplates} from './ensurePerformerScraperMeta'
import ScraperFields from '../assets/ScraperFields'

describe('ensurePerformerScraperMeta helpers', () => {
  it('exposes all performer scraper field templates', () => {
    const fields = getPerformerScraperFieldTemplates()
    expect(fields.length).toBe((ScraperFields as unknown[]).length)
    expect(fields.map((field) => field.key)).toEqual(
      (ScraperFields as Array<{key: string}>).map((field) => field.key),
    )
    expect(fields.every((field) => field.type && field.name)).toBe(true)
  })
})
