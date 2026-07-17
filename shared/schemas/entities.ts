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
  metaId: optionalNullableCoercedNumberSchema,
  name: optionalNullableStringSchema,
  synonyms: optionalNullableStringSchema,
  favorite: optionalCoercedBooleanSchema,
  color: optionalNullableStringSchema,
  bookmark: optionalNullableStringSchema,
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
  order: optionalNullableCoercedNumberSchema,
  clientKey: z.string().optional(),
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
  limit: optionalNullableCoercedNumberSchema,
  navigation: z.array(MediaItemSchema).optional(),
  groups: z.array(z.object({
    key: z.string(),
    label: z.string(),
    count: z.number(),
    filter: z.object({
      metaId: z.number(),
      type: z.string(),
      tagIds: z.array(z.number()).optional(),
      value: z.unknown().optional(),
    }).nullable().optional(),
  }).passthrough()).optional(),
}).passthrough()

export type ParsedMediaType = z.infer<typeof MediaTypeSchema>
export type ParsedTag = z.infer<typeof TagSchema>
export type ParsedMeta = z.infer<typeof MetaSchema>
