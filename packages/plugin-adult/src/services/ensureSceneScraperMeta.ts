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
  return metas.find(
    (meta) => meta.type === type && normalizeName(meta.name) === targetName,
  )
}

function findMetaForSceneField(
  metas: Meta[],
  field: ScraperFieldTemplate,
  t: TranslateFn,
): Meta | undefined {
  const localized = t(`scene_scraper.fields.${field.key}`, field.name)
  const byLocalized = findMetaByNameAndType(metas, localized, field.type)
  if (byLocalized) return byLocalized

  const byEnglish = findMetaByNameAndType(metas, field.name, field.type)
  if (byEnglish) return byEnglish

  if (field.key === 'performers') {
    return metas.find((meta) => meta.type === 'array' && Boolean(meta.scraper))
  }

  return undefined
}

async function ensureSceneFieldMeta({
  field,
  allMeta,
  t,
}: {
  field: ScraperFieldTemplate
  allMeta: Meta[]
  t: TranslateFn
}): Promise<{meta: Meta; created: boolean; metas: Meta[]}> {
  const existing = findMetaForSceneField(allMeta, field, t)
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
  return {
    meta,
    created: true,
    metas: [...allMeta, meta],
  }
}

/**
 * Creates SceneScraperFields meta (if needed), pins them to the video media type,
 * and maps scraper keys. Idempotent for existing fields.
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

  let createdFields = 0
  let pinnedFields = 0
  let mappedFields = 0
  let order = assigned.length

  for (const field of getSceneScraperFieldTemplates()) {
    const {meta, created, metas} = await ensureSceneFieldMeta({field, allMeta, t})
    allMeta = metas
    if (created) createdFields += 1

    let assignment = assignedByMetaId.get(Number(meta.id))
    if (!assignment) {
      await typedApi.pinMetaToMediaType({
        metaId: meta.id,
        mediaTypeId,
        order,
      })
      order += 1
      pinnedFields += 1
      assignment = {
        metaId: meta.id,
        mediaTypeId,
        scraper: null,
      }
      assignedByMetaId.set(Number(meta.id), assignment)
    }

    if (assignment.scraper !== field.key) {
      await typedApi.updateMetaInMediaTypeAssignment({
        metaId: meta.id,
        mediaTypeId,
        data: {scraper: field.key},
      })
      mappedFields += 1
    }
  }

  return {
    createdFields,
    pinnedFields,
    mappedFields,
  }
}
