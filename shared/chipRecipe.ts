/** Chip recipe pack format — schema-only templates shared via Discord / CDN. */

export const CHIP_RECIPE_FORMAT = 'mediachips.chip-recipe' as const
export const CHIP_RECIPE_VERSION = 1 as const
export const CHIP_RECIPE_EXTENSION = '.chiprecipe.json'

export const CHIP_RECIPE_CATEGORIES = [
  'movies',
  'photos',
  'adult',
  'general',
  'other',
] as const

export type ChipRecipeCategory = (typeof CHIP_RECIPE_CATEGORIES)[number]

export type ChipRecipeFieldType =
  | 'array'
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'rating'

export interface ChipRecipeSeedTag {
  name: string
  synonyms?: string
  color?: string | null
  country?: string | null
  favorite?: boolean
  rating?: number
  bookmark?: string | null
  /** Parent tag names in the same field (nested). */
  parentNames?: string[]
}

export interface ChipRecipeField {
  key: string
  type: ChipRecipeFieldType
  name: string
  icon?: string
  hint?: string
  chipVariant?: string
  chipLabel?: boolean
  color?: boolean
  autoColorFromImage?: boolean
  synonyms?: boolean
  nested?: boolean
  favorite?: boolean
  rating?: boolean
  bookmark?: boolean
  country?: boolean
  parser?: boolean
  pathRegex?: string | null
  pathRegexReplace?: string | null
  pathRegexCreateTags?: boolean
  pathRegexEnabled?: boolean
  imageAspectRatio?: number
  tagPageDesign?: string
  hidden?: boolean
  marks?: boolean
  scraper?: boolean
  measurementUnit?: string | null
  ratingMax?: number
  tags?: ChipRecipeSeedTag[]
}

export interface ChipRecipeMediaTypePin {
  mediaTypeName: string
  fieldKeys: string[]
}

export interface ChipRecipe {
  format: typeof CHIP_RECIPE_FORMAT
  version: typeof CHIP_RECIPE_VERSION
  id: string
  name: string
  description?: string
  author?: string
  category?: ChipRecipeCategory | string
  sfw?: boolean
  createdAt?: string
  fields: ChipRecipeField[]
  mediaTypePins?: ChipRecipeMediaTypePin[]
}

export interface ChipRecipeCatalogEntry {
  id: string
  name: string
  description?: string
  author?: string
  category?: string
  sfw?: boolean
  version?: number
  path: string
}

export interface ChipRecipeCatalog {
  updatedAt: string
  recipes: ChipRecipeCatalogEntry[]
}

export const RECIPE_FIELD_FLAG_KEYS = [
  'icon',
  'hint',
  'chipVariant',
  'chipLabel',
  'color',
  'autoColorFromImage',
  'synonyms',
  'nested',
  'favorite',
  'rating',
  'bookmark',
  'country',
  'parser',
  'pathRegex',
  'pathRegexReplace',
  'pathRegexCreateTags',
  'pathRegexEnabled',
  'imageAspectRatio',
  'tagPageDesign',
  'hidden',
  'marks',
  'scraper',
  'measurementUnit',
  'ratingMax',
] as const

export function normalizeRecipeName(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

export function slugifyRecipeId(name: string): string {
  const slug = String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return slug || 'recipe'
}

export function chipRecipeFilename(id: string): string {
  const safe = slugifyRecipeId(id)
  return `${safe}${CHIP_RECIPE_EXTENSION}`
}

export function isChipRecipeFormat(value: unknown): value is ChipRecipe {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return row.format === CHIP_RECIPE_FORMAT
    && Number(row.version) === CHIP_RECIPE_VERSION
    && typeof row.id === 'string'
    && typeof row.name === 'string'
    && Array.isArray(row.fields)
}

export function catalogEntryFromRecipe(
  recipe: ChipRecipe,
  path: string,
): ChipRecipeCatalogEntry {
  return {
    id: recipe.id,
    name: recipe.name,
    ...(recipe.description ? {description: recipe.description} : {}),
    ...(recipe.author ? {author: recipe.author} : {}),
    ...(recipe.category ? {category: String(recipe.category)} : {}),
    ...(typeof recipe.sfw === 'boolean' ? {sfw: recipe.sfw} : {}),
    version: recipe.version,
    path,
  }
}

export function buildChipRecipe(input: {
  name: string
  id?: string
  description?: string
  author?: string
  category?: string
  sfw?: boolean
  createdAt?: string
  fields: ChipRecipeField[]
  mediaTypePins?: ChipRecipeMediaTypePin[]
}): ChipRecipe {
  const name = String(input.name || '').trim() || 'Untitled recipe'
  const id = slugifyRecipeId(input.id || name)
  return {
    format: CHIP_RECIPE_FORMAT,
    version: CHIP_RECIPE_VERSION,
    id,
    name,
    ...(input.description?.trim() ? {description: input.description.trim()} : {}),
    ...(input.author?.trim() ? {author: input.author.trim()} : {}),
    ...(input.category?.trim() ? {category: input.category.trim()} : {}),
    ...(typeof input.sfw === 'boolean' ? {sfw: input.sfw} : {sfw: true}),
    createdAt: input.createdAt || new Date().toISOString(),
    fields: input.fields,
    ...(input.mediaTypePins?.length ? {mediaTypePins: input.mediaTypePins} : {}),
  }
}

export function fieldKeyFromName(name: string, type: string): string {
  const base = slugifyRecipeId(name)
  const typeSlug = slugifyRecipeId(type)
  return typeSlug && typeSlug !== base ? `${typeSlug}-${base}` : base
}
