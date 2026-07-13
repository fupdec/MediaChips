import { describe, expect, it } from 'vitest'
import { findBestMatchingPerformer } from './scraperMatch'
import type { ScraperPerformer } from '../types/scraper'

describe('findBestMatchingPerformer', () => {
  const performers: ScraperPerformer[] = [
    { id: 1, name: 'Jane Doe', slug: 'jane-doe', posters: [{ id: 1, url: 'a', size: 10 }] },
    { id: 2, name: 'Jane', slug: 'jane', posters: [{ id: 2, url: 'b', size: 100 }, { id: 3, url: 'c', size: 200 }] },
    { id: 3, name: 'Janet', slug: 'janet', posters: [] },
  ]

  it('prefers exact slug match', () => {
    expect(findBestMatchingPerformer('Jane Doe', performers)?.id).toBe(1)
  })

  it('prefers exact name match when slug differs', () => {
    expect(findBestMatchingPerformer('Jane', performers)?.id).toBe(2)
  })

  it('falls back to performer with most posters', () => {
    expect(findBestMatchingPerformer('Unknown Person', performers)?.id).toBe(2)
  })
})
