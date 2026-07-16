import { describe, expect, it } from 'vitest'
import { getOrderedScraperPosters, pickPrimaryScraperPoster } from './scraperPosters'
import type { ScraperPoster } from '../types/scraper'

const posters: ScraperPoster[] = [
  { id: 1, url: 'https://example.com/first.jpg', size: 10 },
  { id: 2, url: 'https://example.com/second.jpg', size: 200 },
  { id: 3, url: '', size: 300 },
]

describe('scraperPosters', () => {
  it('keeps API order and skips posters without urls', () => {
    expect(getOrderedScraperPosters(posters).map((poster) => poster.id)).toEqual([1, 2])
  })

  it('picks the first poster in list order, not the largest', () => {
    expect(pickPrimaryScraperPoster(posters)?.id).toBe(1)
  })
})
