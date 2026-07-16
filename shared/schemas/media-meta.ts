import { z } from 'zod'
import {
  FilterObjectSchema,
  MediaItemSchema,
  MediaTypeSchema,
  MetaSchema,
  TagSchema,
} from './entities'
import { optionalNullableCoercedNumberSchema } from './coercion'

export const AssignedMetaSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  order: z.number().optional(),
  metaId: z.number().optional(),
  mediaTypeId: z.number().optional(),
  mediaType: MediaTypeSchema.optional(),
  pinnedMetaId: z.number().optional(),
  scraper: z.string().nullable().optional(),
  show: z.union([z.number(), z.boolean()]).optional(),
  meta: MetaSchema.optional(),
}).passthrough()

export const TagInTagEntrySchema = z.object({
  metaId: z.number(),
  tagId: z.number(),
}).passthrough()

export const ValueInTagEntrySchema = z.object({
  metaId: z.number(),
  value: z.unknown(),
}).passthrough()

export const PinnedMetaLinkSchema = z.object({
  metaId: z.number(),
}).passthrough()

export const TagFilterResponseSchema = z.object({
  items: z.array(TagSchema).optional(),
}).passthrough()

export const TagItemsResponseSchema = z.object({
  items: z.array(TagSchema).optional(),
}).passthrough()

export const PlaylistMediaLinkSchema = z.object({
  mediaId: z.number(),
  playlistId: z.number(),
  order: z.number().optional(),
  medium: MediaItemSchema.optional(),
  media: MediaItemSchema.optional(),
}).passthrough()

export const FilterRowResponseSchema = FilterObjectSchema.omit({ id: true }).extend({
  id: z.number(),
}).passthrough()

export const MarkForVideoSchema = z.object({
  id: z.number().optional(),
  type: z.string(),
  time: z.number(),
  end: z.number().nullable().optional(),
  mediaId: z.number().optional(),
  metaId: z.number().optional(),
  text: z.string().optional(),
  name: z.string().optional(),
  meta: z.object({
    id: z.number().optional(),
    icon: z.string().optional(),
  }).passthrough().optional(),
  tag: z.object({
    name: z.string().optional(),
    color: z.string().optional(),
    metaId: z.number().optional(),
  }).passthrough().optional(),
}).passthrough()

export const VideoMetadataSchema = z.object({
  mediaId: z.number().optional(),
}).passthrough()

export const MediaCountWithTagSchema = z.object({
  count: z.number(),
}).passthrough()

export const MarkClipItemSchema = z.object({
  id: z.number(),
  markId: z.number(),
  path: z.string().optional(),
  name: z.string().optional(),
  basename: z.string().optional(),
  mediaTypeId: optionalNullableCoercedNumberSchema,
  segmentStart: z.number(),
  segmentEnd: z.number(),
  time: z.number().optional(),
}).passthrough()

export const MarkClipsResponseSchema = z.object({
  items: z.array(MarkClipItemSchema),
  count: z.number(),
}).passthrough()

export const UpdatedEntitySchema = z.object({
  id: z.number().optional(),
}).passthrough()

export const TagsInMediaCreateOneSchema = z.tuple([
  z.object({ mediaId: z.number().optional(), tagId: z.number().optional() }).passthrough(),
  z.boolean().optional(),
])

export const ParsePathTagEntrySchema = z.object({
  mediaId: z.number(),
  path: z.string().optional(),
  tagId: z.number().optional(),
  metaId: z.number().optional(),
}).passthrough()

export const MetaSettingSchema = z.object({
  synonyms: z.boolean().optional(),
  hidden: z.boolean().optional(),
  nested: z.boolean().optional(),
  marks: z.boolean().optional(),
  bookmark: z.boolean().optional(),
  parser: z.boolean().optional(),
  country: z.boolean().optional(),
  career: z.boolean().optional(),
  scraper: z.boolean().optional(),
  rating: z.boolean().optional(),
  favorite: z.boolean().optional(),
  chipOutlined: z.boolean().optional(),
  chipLabel: z.boolean().optional(),
  color: z.boolean().optional(),
  imageAspectRatio: z.number().optional(),
  isLink: z.boolean().optional(),
  ratingIcon: z.string().optional(),
  ratingIconEmpty: z.string().optional(),
  ratingIconHalf: z.string().optional(),
  ratingMax: z.number().optional(),
  ratingColor: z.string().optional(),
  ratingHalf: z.boolean().optional(),
  sortBy: z.string().optional(),
  sortDir: z.string().optional(),
  metaId: z.number().optional(),
}).passthrough()

export type ParsedAssignedMeta = z.infer<typeof AssignedMetaSchema>
export type ParsedTagInTagEntry = z.infer<typeof TagInTagEntrySchema>
export type ParsedValueInTagEntry = z.infer<typeof ValueInTagEntrySchema>
export type ParsedPlaylistMediaLink = z.infer<typeof PlaylistMediaLinkSchema>
export type ParsedFilterRowResponse = z.infer<typeof FilterRowResponseSchema>
export type ParsedMarkForVideo = z.infer<typeof MarkForVideoSchema>
export type ParsedVideoMetadata = z.infer<typeof VideoMetadataSchema>
export type ParsedParsePathTagEntry = z.infer<typeof ParsePathTagEntrySchema>
export type ParsedMetaSetting = z.infer<typeof MetaSettingSchema>
