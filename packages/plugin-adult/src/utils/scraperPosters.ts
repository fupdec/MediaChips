import type { ScraperPoster } from '../types/scraper'

export function getOrderedScraperPosters(posters: ScraperPoster[] = []): ScraperPoster[] {
  return posters.filter((poster) => String(poster?.url || '').trim())
}

export function pickPrimaryScraperPoster(posters: ScraperPoster[] = []): ScraperPoster | null {
  return getOrderedScraperPosters(posters)[0] || null
}
