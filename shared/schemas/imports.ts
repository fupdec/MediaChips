import {z} from 'zod'

export const MediaServerLibrarySchema = z.object({
  id: z.string(),
  name: z.string(),
}).passthrough()

export const MediaServerLibrariesResponseSchema = z.object({
  ok: z.boolean().optional(),
  libraries: z.array(MediaServerLibrarySchema).optional(),
  error: z.string().optional(),
}).passthrough()

export type ParsedMediaServerLibrariesResponse = z.infer<typeof MediaServerLibrariesResponseSchema>
