import {z} from 'zod'
import {
  CHIP_RECIPE_CATEGORIES,
  CHIP_RECIPE_FORMAT,
  CHIP_RECIPE_VERSION,
} from '../chipRecipe'

export const ChipRecipeSeedTagSchema = z.object({
  name: z.string().trim().min(1),
  synonyms: z.string().optional(),
  color: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  favorite: z.boolean().optional(),
  rating: z.number().optional(),
  bookmark: z.string().nullable().optional(),
  parentNames: z.array(z.string().trim().min(1)).optional(),
}).passthrough()

export const ChipRecipeFieldSchema = z.object({
  key: z.string().trim().min(1),
  type: z.enum(['array', 'string', 'number', 'boolean', 'date', 'rating']),
  name: z.string().trim().min(1),
  icon: z.string().optional(),
  hint: z.string().optional(),
  chipVariant: z.string().optional(),
  chipLabel: z.boolean().optional(),
  color: z.boolean().optional(),
  autoColorFromImage: z.boolean().optional(),
  synonyms: z.boolean().optional(),
  nested: z.boolean().optional(),
  favorite: z.boolean().optional(),
  rating: z.boolean().optional(),
  bookmark: z.boolean().optional(),
  country: z.boolean().optional(),
  parser: z.boolean().optional(),
  pathRegex: z.string().nullable().optional(),
  pathRegexReplace: z.string().nullable().optional(),
  pathRegexCreateTags: z.boolean().optional(),
  pathRegexEnabled: z.boolean().optional(),
  imageAspectRatio: z.number().optional(),
  tagPageDesign: z.string().optional(),
  hidden: z.boolean().optional(),
  marks: z.boolean().optional(),
  scraper: z.boolean().optional(),
  measurementUnit: z.string().nullable().optional(),
  ratingMax: z.number().optional(),
  tags: z.array(ChipRecipeSeedTagSchema).optional(),
}).passthrough()

export const ChipRecipeMediaTypePinSchema = z.object({
  mediaTypeName: z.string().trim().min(1),
  fieldKeys: z.array(z.string().trim().min(1)).min(1),
})

export const ChipRecipeSchema = z.object({
  format: z.literal(CHIP_RECIPE_FORMAT),
  version: z.literal(CHIP_RECIPE_VERSION),
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().optional(),
  author: z.string().optional(),
  category: z.union([z.enum(CHIP_RECIPE_CATEGORIES), z.string()]).optional(),
  sfw: z.boolean().optional(),
  createdAt: z.string().optional(),
  fields: z.array(ChipRecipeFieldSchema).min(1),
  mediaTypePins: z.array(ChipRecipeMediaTypePinSchema).optional(),
}).passthrough()

export const ChipRecipeCatalogEntrySchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().optional(),
  author: z.string().optional(),
  category: z.string().optional(),
  sfw: z.boolean().optional(),
  version: z.number().optional(),
  path: z.string().trim().min(1),
}).passthrough()

export const ChipRecipeCatalogSchema = z.object({
  updatedAt: z.string(),
  recipes: z.array(ChipRecipeCatalogEntrySchema),
}).passthrough()

export const ExportChipRecipeRequestSchema = z.object({
  metaIds: z.array(z.union([z.number(), z.string()])).optional(),
  name: z.string().trim().min(1),
  id: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  author: z.string().optional(),
  category: z.string().optional(),
  sfw: z.boolean().optional(),
  includeTags: z.boolean().optional(),
})

export const ImportChipRecipeRequestSchema = z.object({
  recipe: ChipRecipeSchema,
})

export const ChipRecipeCatalogFileQuerySchema = z.object({
  path: z.string().trim().min(1),
})

export type ParsedChipRecipe = z.infer<typeof ChipRecipeSchema>
export type ParsedChipRecipeCatalog = z.infer<typeof ChipRecipeCatalogSchema>

export function parseChipRecipe(data: unknown): ParsedChipRecipe {
  return ChipRecipeSchema.parse(data)
}

export function parseChipRecipeCatalog(data: unknown): ParsedChipRecipeCatalog {
  return ChipRecipeCatalogSchema.parse(data)
}
