import { z } from 'zod'
import type { ScraperPerformerSearchResponse } from '@/types/scraper'

export const ScraperPerformerSchema = z.object({
  slug: z.string().optional(),
  posters: z.array(z.unknown()).optional(),
}).passthrough()

export const ScraperPerformerSearchResponseSchema = z.object({
  data: z.array(ScraperPerformerSchema).optional(),
}).passthrough()

export function parseScraperPerformerSearchResponse(data: unknown): ScraperPerformerSearchResponse {
  return ScraperPerformerSearchResponseSchema.parse(data) as ScraperPerformerSearchResponse
}
