import {parseScraperPerformerSearchResponse as parseShared} from '@shared/schemas'
import type {ScraperPerformerSearchResponse} from '../types/scraper'

export {
  ScraperPerformerSchema,
  ScraperPerformerSearchResponseSchema,
} from '@shared/schemas/scrapers'

export function parseScraperPerformerSearchResponse(data: unknown): ScraperPerformerSearchResponse {
  return parseShared(data) as ScraperPerformerSearchResponse
}
