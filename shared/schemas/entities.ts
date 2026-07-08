import { z } from 'zod'
import {
  coercedBooleanSchema,
  optionalCoercedBooleanSchema,
  optionalNullableCoercedNumberSchema,
  optionalNullableStringSchema,
} from './coercion'

export {
  coercedBooleanSchema,
  optionalCoercedBooleanSchema,
  optionalNullableCoercedNumberSchema,
  optionalNullableStringSchema,
} from './coercion'

export const MediaTypeSchema = z.object({
  id: z.number(),
  type: optionalNullableStringSchema,
  name: optionalNullableStringSchema,
  icon: optionalNullableStringSchema,
  extensions: optionalNullableStringSchema,
  hidden: z.boolean().optional(),
  custom: z.boolean().optional(),
  order: optionalNullableCoercedNumberSchema,
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
  name: optionalNullableStringSchema,
  parser: z.boolean().optional(),
  icon: optionalNullableStringSchema,
  chipVariant: optionalNullableStringSchema,
  color: z.boolean().optional(),
  rating: z.boolean().optional(),
  favorite: optionalCoercedBooleanSchema,
  synonyms: z.boolean().optional(),
  imageAspectRatio: optionalNullableCoercedNumberSchema,
  tagPageDesign: optionalNullableStringSchema,
  hidden: z.boolean().optional(),
  order: optionalNullableCoercedNumberSchema,
  type: optionalNullableStringSchema,
}).passthrough()

export const TabSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  url: optionalNullableStringSchema,
  name: optionalNullableStringSchema,
}).passthrough()

export const PlaylistSchema = z.object({
  id: z.number(),
  name: optionalNullableStringSchema,
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
  name: optionalNullableStringSchema,
  path: optionalNullableStringSchema,
  mediaTypeId: optionalNullableCoercedNumberSchema,
  thumb: optionalNullableStringSchema,
  views: optionalNullableCoercedNumberSchema,
  favorite: optionalCoercedBooleanSchema,
  duration: optionalNullableCoercedNumberSchema,
  time: optionalNullableCoercedNumberSchema,
}).passthrough()

export const MediaListResponseSchema = z.object({
  items: z.array(MediaItemSchema).optional(),
  totalFiltered: optionalNullableCoercedNumberSchema,
  totalFilesize: optionalNullableCoercedNumberSchema,
  total: optionalNullableCoercedNumberSchema,
  pages: optionalNullableCoercedNumberSchema,
  page: optionalNullableCoercedNumberSchema,
  navigation: z.array(MediaItemSchema).optional(),
})

export type ParsedMediaType = z.infer<typeof MediaTypeSchema>
export type ParsedTag = z.infer<typeof TagSchema>
export type ParsedMeta = z.infer<typeof MetaSchema>
