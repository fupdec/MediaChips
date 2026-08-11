import { typedApi } from '@/services/typedApi'
import SceneScraperFields from '../assets/SceneScraperFields'
import type { Meta } from '@/types/stores'
import type { AssignedMeta } from '@shared/entities/meta'

export interface ScraperFieldTemplate {
  name: string
  type: string
  key: string
}

export interface EnsureSceneScraperMetaResult {
  createdFields: number
  pinnedFields: number
  mappedFields: number
}

type TranslateFn = (key: string, fallback?: string) => string

const DEFAULT_ICON_BY_FIELD: Record<string, string> = {
  release_date: 'calendar-outline',
  studio: 'domain',
  performers: 'account-group',
  tags: 'tag-multiple-outline',
}

const DEFAULT_ICON_BY_TYPE: Record<string, string> = {
  array: 'tag-multiple-outline',
  string: 'text',
  number: 'numeric',
  date: 'calendar-outline',
  boolean: 'checkbox-marked-outline',
  rating: 'star-outline',
}

/** Common library names users already have (EN/RU) for each scraper slot. */
const FIELD_NAME_ALIASES: Record<string, string[]> = {
  release_date: [
    'release date',
    'release',
    'date',
    'дата релиза',
    'релиз',
    'дата',
  ],
  studio: [
    'studio',
    'studios',
    'website',
    'websites',
    'site',
    'sites',
    'студия',
    'студии',
    'сайт',
    'сайты',
  ],
  performers: [
    'performers',
    'performer',
    'actors',
    'actor',
    'actresses',
    'actress',
    'girls',
    'girl',
    'people',
    'исполнители',
    'исполнитель',
    'актёры',
    'актеры',
    'актрисы',
    'девушки',
  ],
  tags: [
    'tags',
    'tag',
    'теги',
    'тег',
  ],
}

function normalizeName(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function iconForField(field: ScraperFieldTemplate): string {
  return DEFAULT_ICON_BY_FIELD[field.key] || DEFAULT_ICON_BY_TYPE[field.type] || 'shape'
}

export function getSceneScraperFieldTemplates(): ScraperFieldTemplate[] {
  return (SceneScraperFields as ScraperFieldTemplate[]).map((field) => ({...field}))
}

function findMetaByNameAndType(
  metas: Meta[],
  name: string,
  type: string,
): Meta | undefined {
  const targetName = normalizeName(name)
  if (!targetName) return undefined
  return metas.find(
    (meta) => meta.type === type && normalizeName(meta.name) === targetName,
  )
}

function getFieldLookupNames(
  field: ScraperFieldTemplate,
  t: TranslateFn,
): string[] {
  const names = [
    t(`scene_scraper.fields.${field.key}`, field.name),
    field.name,
    ...(FIELD_NAME_ALIASES[field.key] || []),
  ]
  const seen = new Set<string>()
  const unique: string[] = []
  for (const name of names) {
    const key = normalizeName(name)
    if (!key || seen.has(key)) continue
    seen.add(key)
    unique.push(name)
  }
  return unique
}

/**
 * Prefer an already-pinned meta of the right type whose name matches
 * localized/English/alias names. Falls back to any matching meta, then
 * the performer-category scraper flag for the performers slot.
 */
export function findMetaForSceneField(
  metas: Meta[],
  field: ScraperFieldTemplate,
  t: TranslateFn,
  options: {
    preferMetaIds?: Iterable<number>
    excludeMetaIds?: Iterable<number>
  } = {},
): Meta | undefined {
  const prefer = new Set(
    [...(options.preferMetaIds || [])]
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0),
  )
  const exclude = new Set(
    [...(options.excludeMetaIds || [])]
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0),
  )

  const candidates = metas.filter((meta) => {
    if (meta.type !== field.type) return false
    const id = Number(meta.id)
    if (!Number.isFinite(id) || id <= 0) return false
    return !exclude.has(id)
  })

  const lookupNames = getFieldLookupNames(field, t)

  const matchByName = (pool: Meta[]): Meta | undefined => {
    for (const name of lookupNames) {
      const found = findMetaByNameAndType(pool, name, field.type)
      if (found) return found
    }
    return undefined
  }

  if (prefer.size) {
    const pinnedPool = candidates.filter((meta) => prefer.has(Number(meta.id)))
    const pinnedMatch = matchByName(pinnedPool)
    if (pinnedMatch) return pinnedMatch
  }

  const globalMatch = matchByName(candidates)
  if (globalMatch) return globalMatch

  if (field.key === 'performers') {
    const pinnedPerformer = candidates.find(
      (meta) => prefer.has(Number(meta.id)) && Boolean(meta.scraper),
    )
    if (pinnedPerformer) return pinnedPerformer
    return candidates.find((meta) => Boolean(meta.scraper))
  }

  return undefined
}

async function ensureSceneFieldMeta({
  field,
  allMeta,
  t,
  preferMetaIds,
  excludeMetaIds,
}: {
  field: ScraperFieldTemplate
  allMeta: Meta[]
  t: TranslateFn
  preferMetaIds?: Iterable<number>
  excludeMetaIds?: Iterable<number>
}): Promise<{meta: Meta; created: boolean; metas: Meta[]}> {
  const existing = findMetaForSceneField(allMeta, field, t, {
    preferMetaIds,
    excludeMetaIds,
  })
  if (existing) {
    return {meta: existing, created: false, metas: allMeta}
  }

  const name = t(`scene_scraper.fields.${field.key}`, field.name)
  const created = await typedApi.createMeta({
    type: field.type,
    name,
    icon: iconForField(field),
    ...(field.type === 'array'
      ? {
        pageSetting: {page: 1},
        ...(field.key === 'performers'
          ? {
            scraper: true,
            rating: true,
            favorite: true,
            synonyms: true,
            country: true,
          }
          : {}),
      }
      : {}),
  })

  const meta = created.data
  if (!meta?.id) {
    throw new Error(`Failed to create metadata field "${name}"`)
  }

  return {
    meta,
    created: true,
    metas: [...allMeta, meta],
  }
}

/**
 * Creates SceneScraperFields meta (if needed), pins them to the video media type,
 * and maps scraper keys. Idempotent for existing fields.
 * Prefers already-pinned categories (Tags, Girls, Websites, …) over creating duplicates.
 */
export async function ensureSceneScraperMeta({
  mediaTypeId,
  t,
}: {
  mediaTypeId: number
  t: TranslateFn
}): Promise<EnsureSceneScraperMetaResult> {
  if (!Number.isFinite(mediaTypeId) || mediaTypeId <= 0) {
    throw new Error('mediaTypeId is required')
  }

  const metaResponse = await typedApi.getMeta()
  let allMeta = metaResponse.data || []

  const assignedResponse = await typedApi.getAssignedMetaForMediaType(mediaTypeId)
  const assigned: AssignedMeta[] = assignedResponse.data || []
  const assignedByMetaId = new Map(
    assigned
      .filter((row) => row.metaId != null)
      .map((row) => [Number(row.metaId), row]),
  )
  const pinnedMetaIds = [...assignedByMetaId.keys()]
  const usedMetaIds = new Set<number>()

  let createdFields = 0
  let pinnedFields = 0
  let mappedFields = 0
  let order = assigned.length

  for (const field of getSceneScraperFieldTemplates()) {
    const {meta, created, metas} = await ensureSceneFieldMeta({
      field,
      allMeta,
      t,
      preferMetaIds: pinnedMetaIds,
      excludeMetaIds: usedMetaIds,
    })
    allMeta = metas
    if (created) createdFields += 1

    const metaId = Number(meta.id)
    usedMetaIds.add(metaId)

    let assignment = assignedByMetaId.get(metaId)
    if (!assignment) {
      await typedApi.pinMetaToMediaType({
        metaId,
        mediaTypeId,
        order,
      })
      order += 1
      pinnedFields += 1
      assignment = {
        metaId,
        mediaTypeId,
        scraper: null,
      }
      assignedByMetaId.set(metaId, assignment)
      pinnedMetaIds.push(metaId)
    }

    if (assignment.scraper !== field.key) {
      await typedApi.updateMetaInMediaTypeAssignment({
        metaId,
        mediaTypeId,
        data: {scraper: field.key},
      })
      assignment.scraper = field.key
      mappedFields += 1
    }
  }

  return {
    createdFields,
    pinnedFields,
    mappedFields,
  }
}
