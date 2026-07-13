import { z } from 'zod'
import type { SceneScraperSearchResponse } from '@/types/sceneScraper'

export const SceneScraperImageSchema = z.object({
  url: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
}).passthrough()

export const SceneScraperPerformerSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
}).passthrough()

export const SceneScraperSceneSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  date: z.string().nullable().optional(),
  release_date: z.string().nullable().optional(),
  duration: z.number().nullable().optional(),
  details: z.string().nullable().optional(),
  code: z.string().nullable().optional(),
  images: z.array(SceneScraperImageSchema).optional(),
  studio: z.object({
    id: z.string().optional(),
    name: z.string().optional(),
  }).nullable().optional(),
  performers: z.array(z.object({
    performer: SceneScraperPerformerSchema.optional(),
  }).passthrough()).optional(),
  tags: z.array(z.object({
    id: z.string().optional(),
    name: z.string().optional(),
  }).passthrough()).optional(),
}).passthrough()

export const SceneScraperSearchResponseSchema = z.object({
  data: z.array(SceneScraperSceneSchema).optional(),
  matchMethod: z.enum(['oshash', 'search']).optional(),
  oshash: z.string().nullable().optional(),
}).passthrough()

export function parseSceneScraperSearchResponse(data: unknown): SceneScraperSearchResponse {
  return SceneScraperSearchResponseSchema.parse(data) as SceneScraperSearchResponse
}
