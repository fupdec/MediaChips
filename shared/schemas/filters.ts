import { z } from 'zod'
import { FilterObjectSchema, MediaItemSchema } from './entities'

export const SavedFilterSchema = z.object({
  id: z.number().optional(),
  name: z.string().optional(),
  filters: z.array(FilterObjectSchema).optional(),
  savedAt: z.string().optional(),
  sortBy: z.string().nullable().optional(),
  sortDir: z.string().nullable().optional(),
  size: z.number().nullable().optional(),
  view: z.union([z.number(), z.string()]).nullable().optional(),
  groupBy: z.string().nullable().optional(),
}).passthrough()

export const DynamicPlaylistSummarySchema = z.object({
  id: z.number(),
  count: z.number().nullable().optional(),
  previewIds: z.array(z.number()).optional(),
  name: z.string().optional(),
}).passthrough()

export const SavedFilterMediaResponseSchema = z.object({
  items: z.array(MediaItemSchema).optional(),
  count: z.number().optional(),
}).passthrough()

export const SavedFilterSummaryResponseSchema = z.object({
  count: z.number().optional(),
  previewIds: z.array(z.number()).optional(),
}).passthrough()

export const FilterRowInSavedFilterSchema = z.object({
  filterRow: FilterObjectSchema.passthrough().optional(),
}).passthrough()

export const TagInFilterRowSchema = z.object({
  tagId: z.number(),
})

export const SavedFilterBasicSchema = z.object({
  id: z.number(),
  name: z.string().nullable().optional(),
}).passthrough()

export const SavedFilterFindOrCreateHydratedSchema = z.tuple([
  SavedFilterSchema,
  z.boolean(),
])

export type ParsedSavedFilter = z.infer<typeof SavedFilterSchema>
export type ParsedDynamicPlaylistSummary = z.infer<typeof DynamicPlaylistSummarySchema>
export type ParsedSavedFilterMediaResponse = z.infer<typeof SavedFilterMediaResponseSchema>
export type ParsedSavedFilterSummaryResponse = z.infer<typeof SavedFilterSummaryResponseSchema>
export type ParsedFilterRowInSavedFilter = z.infer<typeof FilterRowInSavedFilterSchema>
export type ParsedTagInFilterRow = z.infer<typeof TagInFilterRowSchema>
export type ParsedSavedFilterBasic = z.infer<typeof SavedFilterBasicSchema>
