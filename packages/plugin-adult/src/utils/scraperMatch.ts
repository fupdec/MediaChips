import orderBy from 'lodash/orderBy'
import type { ScraperPerformer } from '../types/scraper'

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase()
}

function toSlug(value: string): string {
  return normalizeQuery(value).replaceAll(' ', '-')
}

function getPerformerName(performer: ScraperPerformer): string {
  return typeof performer.name === 'string' ? performer.name : ''
}

function getPosterCount(performer: ScraperPerformer): number {
  return Array.isArray(performer.posters) ? performer.posters.length : 0
}

function getMatchScore(query: string, performer: ScraperPerformer): number {
  const normalizedQuery = normalizeQuery(query)
  if (!normalizedQuery) return 0

  const slug = toSlug(query)
  const performerSlug = typeof performer.slug === 'string' ? performer.slug.toLowerCase() : ''
  if (performerSlug && performerSlug === slug) return 1000

  const name = normalizeQuery(getPerformerName(performer))
  if (!name) return getPosterCount(performer)

  if (name === normalizedQuery) return 900
  if (name.startsWith(normalizedQuery)) return 700
  if (name.includes(normalizedQuery)) return 500
  if (normalizedQuery.includes(name)) return 400

  return getPosterCount(performer)
}

export function findBestMatchingPerformer(
  query: string,
  performers: ScraperPerformer[] = [],
): ScraperPerformer | null {
  if (!performers.length) return null

  const sorted = orderBy(
    performers,
    [(performer) => getMatchScore(query, performer), getPosterCount],
    ['desc', 'desc'],
  )

  return sorted[0] || null
}
