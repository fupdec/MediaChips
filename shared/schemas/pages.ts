import { z } from 'zod'
import { PlaylistSchema } from './entities'

export const PageSettingsRecordSchema = z.object({
  page: z.number().optional(),
  limit: z.number().optional(),
  size: z.number().optional(),
  view: z.union([z.number(), z.string()]).optional(),
  sortBy: z.string().optional(),
  sortDir: z.string().optional(),
  firstChar: z.string().optional(),
  filterId: z.number().optional(),
  query: z.unknown().optional(),
}).passthrough()

export const PageSettingsFindOrCreateSchema = z.tuple([
  PageSettingsRecordSchema.nullable(),
  z.boolean().optional(),
])

export const PlaylistCreateResponseSchema = PlaylistSchema

export type ParsedPageSettingsRecord = z.infer<typeof PageSettingsRecordSchema>
export type ParsedPageSettingsFindOrCreate = z.infer<typeof PageSettingsFindOrCreateSchema>
export type ParsedPlaylistCreateResponse = z.infer<typeof PlaylistCreateResponseSchema>
