import axios from 'axios'
import fs from 'fs'
import path from 'path'
import {inArray, or} from 'drizzle-orm'
import type {ApiDb} from '../types/db'
import {HttpError} from '../types/errors'
import {createMetaRepository} from '../db/repositories/meta'
import {createMetaInMediaTypesRepository} from '../db/repositories/metaInMediaTypes'
import {createTagsRepository} from '../db/repositories/tags'
import {createTagsInTagRepository} from '../db/repositories/tagsInTag'
import {createMediaTypesRepository} from '../db/repositories/mediaTypes'
import {tagsInTags} from '../db/schema/tagsInTag'
import {findTagIdByNormalizedName} from './tagNameUniqueness'
import {
  RECIPE_FIELD_FLAG_KEYS,
  buildChipRecipe,
  chipRecipeFilename,
  fieldKeyFromName,
  normalizeRecipeName,
  type ChipRecipe,
  type ChipRecipeCatalog,
  type ChipRecipeField,
  type ChipRecipeSeedTag,
} from '../../shared/chipRecipe'
import {
  parseChipRecipe,
  parseChipRecipeCatalog,
  type ParsedChipRecipe,
} from '../../shared/schemas/chipRecipe'
import {projectPath} from '../../shared/projectRoot'

export const DEFAULT_CHIP_RECIPE_CATALOG_URL =
  'https://raw.githubusercontent.com/mediachips/chip-recipes/main/index.json'

export const DISCORD_CHIP_RECIPES_URL = 'https://discord.gg/dEQPper2yu'

const CATALOG_FETCH_TIMEOUT_MS = 20_000

export type ChipRecipeExportInput = {
  metaIds?: Array<number | string>
  name: string
  id?: string
  description?: string
  author?: string
  category?: string
  sfw?: boolean
  /** When true, embed seed tags (names/colors/synonyms/nested) for array fields. */
  includeTags?: boolean
}

export type ChipRecipeApplyCounts = {
  fieldsCreated: number
  fieldsSkipped: number
  tagsCreated: number
  tagsSkipped: number
  tagsConflicted: number
  nestedLinksCreated: number
  pinsCreated: number
  pinsSkipped: number
  mediaTypesMissing: string[]
}

export type ChipRecipePreviewResult = ChipRecipeApplyCounts & {
  recipe: Pick<ChipRecipe, 'id' | 'name' | 'description' | 'author' | 'category' | 'sfw'>
  fieldNames: string[]
}

function asBool(value: unknown): boolean | undefined {
  if (value === true || value === 1 || value === '1') return true
  if (value === false || value === 0 || value === '0') return false
  return undefined
}

function pickFieldFlags(meta: Record<string, unknown>): Partial<ChipRecipeField> {
  const out: Partial<ChipRecipeField> = {}
  for (const key of RECIPE_FIELD_FLAG_KEYS) {
    const value = meta[key]
    if (value === undefined || value === null || value === '') continue
    if (
      key === 'chipLabel'
      || key === 'color'
      || key === 'autoColorFromImage'
      || key === 'synonyms'
      || key === 'nested'
      || key === 'favorite'
      || key === 'rating'
      || key === 'bookmark'
      || key === 'country'
      || key === 'parser'
      || key === 'pathRegexCreateTags'
      || key === 'pathRegexEnabled'
      || key === 'hidden'
      || key === 'marks'
      || key === 'scraper'
    ) {
      const bool = asBool(value)
      if (bool !== undefined) (out as Record<string, unknown>)[key] = bool
      continue
    }
    ;(out as Record<string, unknown>)[key] = value
  }
  return out
}

function emptyCounts(): ChipRecipeApplyCounts {
  return {
    fieldsCreated: 0,
    fieldsSkipped: 0,
    tagsCreated: 0,
    tagsSkipped: 0,
    tagsConflicted: 0,
    nestedLinksCreated: 0,
    pinsCreated: 0,
    pinsSkipped: 0,
    mediaTypesMissing: [],
  }
}

function resolveCatalogBaseUrl(catalogUrl: string): string {
  const trimmed = catalogUrl.replace(/\/+$/, '')
  if (trimmed.endsWith('/index.json')) {
    return trimmed.slice(0, -'/index.json'.length)
  }
  return trimmed.replace(/\/[^/]*$/, '')
}

function assertSafeCatalogPath(relativePath: string): string {
  const normalized = String(relativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
  if (!normalized || normalized.includes('..') || normalized.includes(':')) {
    throw new HttpError(400, 'Invalid catalog path.')
  }
  if (!normalized.startsWith('recipes/') || !normalized.endsWith('.chiprecipe.json')) {
    throw new HttpError(400, 'Catalog path must be under recipes/*.chiprecipe.json')
  }
  return normalized
}

export function getChipRecipeCatalogUrl(): string {
  const fromEnv = String(process.env.CHIP_RECIPE_CATALOG_URL || '').trim()
  return fromEnv || DEFAULT_CHIP_RECIPE_CATALOG_URL
}

function localChipRecipesRoot(): string {
  return projectPath('chip-recipes')
}

function readLocalChipRecipeCatalog(): (ChipRecipeCatalog & {baseUrl: string; catalogUrl: string}) | null {
  const indexPath = path.join(localChipRecipesRoot(), 'index.json')
  if (!fs.existsSync(indexPath)) return null
  try {
    const catalog = parseChipRecipeCatalog(JSON.parse(fs.readFileSync(indexPath, 'utf8')))
    return {
      ...catalog,
      baseUrl: `file://${localChipRecipesRoot()}`,
      catalogUrl: `file://${indexPath}`,
    }
  } catch {
    return null
  }
}

function readLocalChipRecipeFile(relativePath: string): ParsedChipRecipe | null {
  const safePath = assertSafeCatalogPath(relativePath)
  const root = path.resolve(localChipRecipesRoot())
  const fullPath = path.resolve(root, ...safePath.split('/'))
  if (!fullPath.startsWith(root + path.sep) && fullPath !== root) return null
  if (!fs.existsSync(fullPath)) return null
  try {
    return parseChipRecipe(JSON.parse(fs.readFileSync(fullPath, 'utf8')))
  } catch {
    return null
  }
}

export async function fetchChipRecipeCatalog(
  catalogUrl = getChipRecipeCatalogUrl(),
): Promise<ChipRecipeCatalog & {baseUrl: string; catalogUrl: string}> {
  try {
    const response = await axios.get(catalogUrl, {
      timeout: CATALOG_FETCH_TIMEOUT_MS,
      responseType: 'json',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'mediachips/1.0 (+https://github.com/fupdec/MediaChips)',
      },
      validateStatus: (status) => status >= 200 && status < 300,
    })
    const catalog = parseChipRecipeCatalog(response.data)
    return {
      ...catalog,
      baseUrl: resolveCatalogBaseUrl(catalogUrl),
      catalogUrl,
    }
  } catch (err) {
    const local = readLocalChipRecipeCatalog()
    if (local) return local
    if (err instanceof HttpError) throw err
    const message = err instanceof Error ? err.message : String(err)
    throw new HttpError(502, `Failed to fetch chip recipe catalog: ${message}`)
  }
}

export async function fetchChipRecipeFromCatalog(
  relativePath: string,
  catalogUrl = getChipRecipeCatalogUrl(),
): Promise<ParsedChipRecipe> {
  const safePath = assertSafeCatalogPath(relativePath)
  const baseUrl = resolveCatalogBaseUrl(catalogUrl)

  if (!baseUrl.startsWith('file://')) {
    const url = `${baseUrl}/${safePath}`
    try {
      const response = await axios.get(url, {
        timeout: CATALOG_FETCH_TIMEOUT_MS,
        responseType: 'json',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'mediachips/1.0 (+https://github.com/fupdec/MediaChips)',
        },
        validateStatus: (status) => status >= 200 && status < 300,
      })
      return parseChipRecipe(response.data)
    } catch {
      // fall through to bundled local catalog
    }
  }

  const local = readLocalChipRecipeFile(safePath)
  if (local) return local
  throw new HttpError(404, `Chip recipe not found: ${safePath}`)
}

export function exportChipRecipe(db: ApiDb, input: ChipRecipeExportInput): ChipRecipe {
  const metaRepo = createMetaRepository(db.drizzle)
  const metaInMediaTypesRepo = createMetaInMediaTypesRepository(db.drizzle)
  const tagsRepo = createTagsRepository(db.drizzle, db.sqlite)
  const mediaTypesRepo = createMediaTypesRepository(db.drizzle)

  const allMeta = metaRepo.findAll()
  const selectedIds = Array.isArray(input.metaIds) && input.metaIds.length
    ? new Set(input.metaIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))
    : null

  const metas = selectedIds
    ? allMeta.filter((meta) => selectedIds.has(Number(meta.id)))
    : allMeta

  if (!metas.length) {
    throw new HttpError(400, 'No metadata fields selected for export.')
  }

  const metaIds = metas.map((meta) => Number(meta.id))
  const includeTags = Boolean(input.includeTags)
  const tags = includeTags ? tagsRepo.findByMetaIds(metaIds) : []
  const tagById = new Map(tags.map((tag) => [Number(tag.id), tag]))
  const parentNamesByTagId = new Map<number, string[]>()

  if (includeTags && tags.length) {
    const tagIds = tags.map((tag) => Number(tag.id))
    const links = db.drizzle.select()
      .from(tagsInTags)
      .where(or(
        inArray(tagsInTags.tagId, tagIds),
        inArray(tagsInTags.parentTagId, tagIds),
      ))
      .all()

    for (const link of links) {
      const childId = Number(link.tagId)
      const parent = tagById.get(Number(link.parentTagId))
      const child = tagById.get(childId)
      if (!parent?.name || !child) continue
      if (Number(parent.metaId) !== Number(child.metaId)) continue
      const list = parentNamesByTagId.get(childId) || []
      const parentName = String(parent.name)
      if (!list.includes(parentName)) list.push(parentName)
      parentNamesByTagId.set(childId, list)
    }
  }

  const tagsByMetaId = new Map<number, typeof tags>()
  for (const tag of tags) {
    const metaId = Number(tag.metaId)
    const list = tagsByMetaId.get(metaId) || []
    list.push(tag)
    tagsByMetaId.set(metaId, list)
  }

  const fields: ChipRecipeField[] = []
  const keyByMetaId = new Map<number, string>()
  const usedKeys = new Set<string>()

  for (const meta of metas) {
    const type = String(meta.type || 'string') as ChipRecipeField['type']
    const name = String(meta.name || '').trim() || `Field ${meta.id}`
    let key = fieldKeyFromName(name, type)
    if (usedKeys.has(key)) key = `${key}-${meta.id}`
    usedKeys.add(key)
    keyByMetaId.set(Number(meta.id), key)

    const field: ChipRecipeField = {
      key,
      type,
      name,
      ...pickFieldFlags(meta as unknown as Record<string, unknown>),
    }

    if (includeTags && type === 'array') {
      const seedTags: ChipRecipeSeedTag[] = (tagsByMetaId.get(Number(meta.id)) || []).map((tag) => {
        const seed: ChipRecipeSeedTag = {name: String(tag.name || '').trim()}
        if (tag.synonyms) seed.synonyms = String(tag.synonyms)
        if (tag.color) seed.color = String(tag.color)
        if (tag.country) seed.country = String(tag.country)
        if (tag.favorite) seed.favorite = true
        if (tag.rating) seed.rating = Number(tag.rating) || 0
        if (tag.bookmark) seed.bookmark = String(tag.bookmark)
        const parents = parentNamesByTagId.get(Number(tag.id))
        if (parents?.length) seed.parentNames = parents
        return seed
      }).filter((tag) => tag.name)

      if (seedTags.length) field.tags = seedTags
    }

    fields.push(field)
  }

  const mediaTypes = mediaTypesRepo.findAll()
  const mediaTypeById = new Map(mediaTypes.map((row) => [Number(row.id), row]))
  const pinsByMediaTypeName = new Map<string, string[]>()

  for (const metaId of metaIds) {
    const key = keyByMetaId.get(metaId)
    if (!key) continue
    const assignments = metaInMediaTypesRepo.findByMetaId(metaId)
    for (const assignment of assignments) {
      const mediaType = mediaTypeById.get(Number(assignment.mediaTypeId))
        || (assignment as {mediaType?: {name?: string | null}}).mediaType
      const mediaTypeName = String(mediaType?.name || '').trim()
      if (!mediaTypeName) continue
      const list = pinsByMediaTypeName.get(mediaTypeName) || []
      if (!list.includes(key)) list.push(key)
      pinsByMediaTypeName.set(mediaTypeName, list)
    }
  }

  const mediaTypePins = [...pinsByMediaTypeName.entries()].map(([mediaTypeName, fieldKeys]) => ({
    mediaTypeName,
    fieldKeys,
  }))

  return buildChipRecipe({
    name: input.name,
    id: input.id,
    description: input.description,
    author: input.author,
    category: input.category,
    sfw: input.sfw,
    fields,
    mediaTypePins,
  })
}

function findMetaByTypeName(
  metas: Array<{id: number; type: string | null; name: string | null}>,
  type: string,
  name: string,
) {
  const targetType = normalizeRecipeName(type)
  const targetName = normalizeRecipeName(name)
  return metas.find(
    (meta) => normalizeRecipeName(meta.type) === targetType
      && normalizeRecipeName(meta.name) === targetName,
  )
}

function applyChipRecipe(
  db: ApiDb,
  recipeInput: unknown,
  dryRun: boolean,
): ChipRecipePreviewResult {
  const recipe = parseChipRecipe(recipeInput)
  const metaRepo = createMetaRepository(db.drizzle)
  const metaInMediaTypesRepo = createMetaInMediaTypesRepository(db.drizzle)
  const tagsRepo = createTagsRepository(db.drizzle, db.sqlite)
  const tagsInTagRepo = createTagsInTagRepository(db.drizzle)
  const mediaTypesRepo = createMediaTypesRepository(db.drizzle)

  const counts = emptyCounts()
  let metas = metaRepo.findAll()
  const mediaTypes = mediaTypesRepo.findAll()
  const mediaTypeByName = new Map(
    mediaTypes.map((row) => [normalizeRecipeName(row.name), row]),
  )
  const mediaTypeByType = new Map(
    mediaTypes
      .filter((row) => row.type)
      .map((row) => [normalizeRecipeName(row.type), row]),
  )

  function resolveMediaType(name: string) {
    const key = normalizeRecipeName(name)
    return mediaTypeByName.get(key) || mediaTypeByType.get(key) || null
  }

  const keyToMetaId = new Map<string, number>()
  const nestedPending: Array<{metaId: number; childName: string; parentNames: string[]}> = []

  for (const field of recipe.fields) {
    const existing = findMetaByTypeName(metas, field.type, field.name)
    let metaId: number

    if (existing) {
      counts.fieldsSkipped += 1
      metaId = Number(existing.id)
    } else if (dryRun) {
      counts.fieldsCreated += 1
      metaId = -1
    } else {
      const created = metaRepo.create({
        type: field.type,
        name: field.name,
        icon: field.icon,
        hint: field.hint,
        chipVariant: field.chipVariant,
        chipLabel: field.chipLabel,
        color: field.color,
        autoColorFromImage: field.autoColorFromImage,
        synonyms: field.synonyms,
        nested: field.nested,
        favorite: field.favorite,
        rating: field.rating,
        bookmark: field.bookmark,
        country: field.country,
        parser: field.parser,
        pathRegex: field.pathRegex,
        pathRegexReplace: field.pathRegexReplace,
        pathRegexCreateTags: field.pathRegexCreateTags,
        pathRegexEnabled: field.pathRegexEnabled,
        imageAspectRatio: field.imageAspectRatio,
        tagPageDesign: field.tagPageDesign,
        hidden: field.hidden,
        marks: field.marks,
        scraper: field.scraper,
        measurementUnit: field.measurementUnit,
        ratingMax: field.ratingMax,
        pageSetting: field.type === 'array' ? {page: 1} : undefined,
      })
      if (created.type === 'array') {
        const dir = path.join(db.path ?? '', 'meta', String(created.id))
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true})
        metaRepo.ensureArrayMetaResources(created.id)
      }
      counts.fieldsCreated += 1
      metaId = Number(created.id)
      metas = [...metas, created]
    }

    keyToMetaId.set(field.key, metaId)

    if (field.type !== 'array' || !field.tags?.length) continue

    if (metaId < 0) {
      // Field would be created — estimate tag outcomes without a category id.
      for (const seed of field.tags) {
        const existingId = findTagIdByNormalizedName(db.sqlite, seed.name)
        if (existingId != null) counts.tagsConflicted += 1
        else counts.tagsCreated += 1
        if (seed.parentNames?.length) {
          nestedPending.push({
            metaId: -1,
            childName: String(seed.name || '').trim(),
            parentNames: seed.parentNames,
          })
        }
      }
      continue
    }

    const existingTags = tagsRepo.findByMetaIds([metaId])
    const existingByName = new Map(
      existingTags.map((tag) => [normalizeRecipeName(tag.name), tag]),
    )

    for (const seed of field.tags) {
      const seedName = String(seed.name || '').trim()
      if (!seedName) continue

      const inCategory = existingByName.get(normalizeRecipeName(seedName))
      if (inCategory) {
        counts.tagsSkipped += 1
        if (seed.parentNames?.length) {
          nestedPending.push({
            metaId,
            childName: seedName,
            parentNames: seed.parentNames,
          })
        }
        continue
      }

      const globalId = findTagIdByNormalizedName(db.sqlite, seedName)
      if (globalId != null) {
        counts.tagsConflicted += 1
        continue
      }

      if (dryRun) {
        counts.tagsCreated += 1
        if (seed.parentNames?.length) {
          nestedPending.push({
            metaId,
            childName: seedName,
            parentNames: seed.parentNames,
          })
        }
        continue
      }

      const [created] = tagsRepo.bulkCreate([{
        name: seedName,
        metaId,
        synonyms: seed.synonyms ?? null,
        color: seed.color ?? null,
        country: seed.country ?? null,
        favorite: Boolean(seed.favorite),
        rating: Number(seed.rating) || 0,
        bookmark: seed.bookmark ?? null,
      }])
      counts.tagsCreated += 1
      existingByName.set(normalizeRecipeName(seedName), created)
      if (seed.parentNames?.length) {
        nestedPending.push({
          metaId,
          childName: seedName,
          parentNames: seed.parentNames,
        })
      }
    }
  }

  if (!dryRun) {
    const allTags = tagsRepo.findByMetaIds(
      [...new Set([...keyToMetaId.values()].filter((id) => id > 0))],
    )
    const tagsByMetaAndName = new Map<string, number>()
    for (const tag of allTags) {
      tagsByMetaAndName.set(
        `${Number(tag.metaId)}:${normalizeRecipeName(tag.name)}`,
        Number(tag.id),
      )
    }

    for (const pending of nestedPending) {
      const childId = tagsByMetaAndName.get(
        `${pending.metaId}:${normalizeRecipeName(pending.childName)}`,
      )
      if (!childId) continue
      for (const parentName of pending.parentNames) {
        const parentId = tagsByMetaAndName.get(
          `${pending.metaId}:${normalizeRecipeName(parentName)}`,
        )
        if (!parentId || parentId === childId) continue
        const [, created] = tagsInTagRepo.findOrCreate({
          parentTagId: parentId,
          tagId: childId,
          metaId: pending.metaId,
        })
        if (created) counts.nestedLinksCreated += 1
      }
    }
  } else {
    // dry-run nested count already approximated above for new fields; for existing, count pending
    for (const pending of nestedPending) {
      counts.nestedLinksCreated += pending.parentNames.length
    }
  }

  for (const pin of recipe.mediaTypePins || []) {
    const mediaType = resolveMediaType(pin.mediaTypeName)
    if (!mediaType) {
      if (!counts.mediaTypesMissing.includes(pin.mediaTypeName)) {
        counts.mediaTypesMissing.push(pin.mediaTypeName)
      }
      continue
    }

    const assigned = dryRun && [...keyToMetaId.values()].every((id) => id < 0)
      ? []
      : metaInMediaTypesRepo.findByMediaTypeId(Number(mediaType.id))
    const assignedIds = new Set(assigned.map((row) => Number(row.metaId)))
    let order = assigned.length

    for (const fieldKey of pin.fieldKeys) {
      const metaId = keyToMetaId.get(fieldKey)
      if (metaId == null) continue
      if (metaId < 0) {
        counts.pinsCreated += 1
        continue
      }
      if (assignedIds.has(metaId)) {
        counts.pinsSkipped += 1
        continue
      }
      if (dryRun) {
        counts.pinsCreated += 1
        continue
      }
      metaInMediaTypesRepo.create({
        metaId,
        mediaTypeId: Number(mediaType.id),
        order,
      })
      order += 1
      assignedIds.add(metaId)
      counts.pinsCreated += 1
    }
  }

  return {
    ...counts,
    recipe: {
      id: recipe.id,
      name: recipe.name,
      description: recipe.description,
      author: recipe.author,
      category: recipe.category,
      sfw: recipe.sfw,
    },
    fieldNames: recipe.fields.map((field) => field.name),
  }
}

export function previewChipRecipe(db: ApiDb, recipe: unknown): ChipRecipePreviewResult {
  return applyChipRecipe(db, recipe, true)
}

export function importChipRecipe(db: ApiDb, recipe: unknown): ChipRecipePreviewResult {
  return applyChipRecipe(db, recipe, false)
}

export function chipRecipeDiscordInfo() {
  return {
    discordUrl: DISCORD_CHIP_RECIPES_URL,
    filenameExample: chipRecipeFilename('movies-basic'),
    shareHint: 'Export a .chiprecipe.json and attach it in the MediaChips Discord #chip-recipes channel.',
  }
}
