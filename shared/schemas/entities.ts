import { z } from 'zod'
import { coercedBooleanSchema, optionalCoercedBooleanSchema } from './coercion'

export { coercedBooleanSchema, optionalCoercedBooleanSchema } from './coercion'

export const MediaTypeSchema = z.object({
  id: z.number(),
  type: z.string().optional(),
  name: z.string().optional(),
  nameSingular: z.string().optional(),
  icon: z.string().optional(),
  extensions: z.string().optional(),
  hidden: z.boolean().optional(),
  custom: z.boolean().optional(),
  order: z.number().optional(),
})

export const TagSchema = z.object({
  id: z.number(),
  metaId: z.number().nullable().optional(),
  name: z.string().nullable().optional(),
  synonyms: z.string().nullable().optional(),
  favorite: optionalCoercedBooleanSchema,
  color: z.string().nullable().optional(),
  bookmark: z.string().nullable().optional(),
}).passthrough()

export const MetaSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  parser: z.boolean().optional(),
  icon: z.string().optional(),
  chipVariant: z.string().optional(),
  color: z.boolean().optional(),
  rating: z.boolean().optional(),
  favorite: optionalCoercedBooleanSchema,
  synonyms: z.boolean().optional(),
  imageAspectRatio: z.number().optional(),
  tagPageDesign: z.string().optional(),
  hidden: z.boolean().optional(),
  order: z.number().optional(),
  type: z.string().optional(),
}).passthrough()

export const TabSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  url: z.string().optional(),
  name: z.string().optional(),
}).passthrough()

export const PlaylistSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
}).passthrough()

export const SettingEntrySchema = z.object({
  option: z.string(),
  value: z.string(),
})

export const FilterObjectSchema = z.object({
  id: z.number().nullable(),
  param: z.union([z.string(), z.number()]).nullable(),
  type: z.string().nullable(),
  cond: z.string().nullable(),
  val: z.unknown().default(null),
  note: z.string().nullable(),
  active: coercedBooleanSchema,
  lock: coercedBooleanSchema,
  removed: coercedBooleanSchema.optional(),
  metaId: z.number().nullable().optional(),
})

export const MediaItemSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  path: z.string().optional(),
  mediaTypeId: z.number().optional(),
  thumb: z.string().optional(),
  views: z.number().optional(),
  favorite: optionalCoercedBooleanSchema,
  duration: z.number().optional(),
  time: z.number().optional(),
}).passthrough()

export const MediaListResponseSchema = z.object({
  items: z.array(MediaItemSchema).optional(),
  totalFiltered: z.number().optional(),
  totalFilesize: z.number().optional(),
  total: z.number().optional(),
  pages: z.number().optional(),
  page: z.number().optional(),
  navigation: z.array(MediaItemSchema).optional(),
})

export type ParsedMediaType = z.infer<typeof MediaTypeSchema>
export type ParsedTag = z.infer<typeof TagSchema>
export type ParsedMeta = z.infer<typeof MetaSchema>
