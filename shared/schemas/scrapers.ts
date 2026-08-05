import {z} from 'zod'

export const ScraperPerformerSchema = z.object({
  slug: z.string().optional(),
  posters: z.array(z.unknown()).optional(),
}).passthrough()

export const ScraperPerformerSearchResponseSchema = z.object({
  data: z.array(ScraperPerformerSchema).optional(),
}).passthrough()

export const SceneScraperImageSchema = z.object({
  url: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
}).passthrough()

export const SceneScraperPerformerSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  gender: z.string().nullable().optional(),
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

export const SceneScraperMarkerSchema = z.object({
  title: z.string(),
  time: z.number(),
  end: z.number().nullable().optional(),
}).passthrough()

export const SceneScraperMarkersResponseSchema = z.object({
  data: z.array(SceneScraperMarkerSchema).optional(),
}).passthrough()

export const SceneScraperMarkersApplyResultSchema = z.object({
  imported: z.number(),
  skipped: z.number(),
  total: z.number(),
}).passthrough()

export const CamGirlFinderSearchResponseSchema = z.object({
  mode: z.enum(['face', 'name']),
  jobId: z.string().optional(),
  status: z.string().optional(),
  duration: z.number().optional(),
  message: z.string().optional(),
  urls: z.object({
    job: z.string().optional(),
    fullImage: z.string().optional(),
    faceImage: z.string().optional(),
  }).passthrough().optional(),
  data: z.array(z.record(z.unknown())).default([]),
}).passthrough()

export const TmdbStatusSchema = z.object({
  configured: z.boolean(),
}).passthrough()

export const TmdbSearchHitSchema = z.object({
  id: z.number(),
  mediaType: z.enum(['movie', 'tv']),
  title: z.string(),
  originalTitle: z.string().nullable().optional(),
  overview: z.string().nullable().optional(),
  releaseDate: z.string().nullable().optional(),
  posterUrl: z.string().nullable().optional(),
  voteAverage: z.number().nullable().optional(),
}).passthrough()

export const TmdbSearchResponseSchema = z.object({
  results: z.array(TmdbSearchHitSchema).default([]),
}).passthrough()

export const TmdbPersonSearchHitSchema = z.object({
  id: z.number(),
  name: z.string(),
  originalName: z.string().nullable().optional(),
  knownForDepartment: z.string().nullable().optional(),
  profileUrl: z.string().nullable().optional(),
  popularity: z.number().nullable().optional(),
}).passthrough()

export const TmdbPersonSearchResponseSchema = z.object({
  results: z.array(TmdbPersonSearchHitSchema).default([]),
}).passthrough()

export const TmdbExtrasResponseSchema = z.object({
  extras: z.record(z.unknown()).optional(),
}).passthrough()
