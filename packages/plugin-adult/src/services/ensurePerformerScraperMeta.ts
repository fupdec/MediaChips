import { typedApi } from '@/services/typedApi'
import ScraperFields from '../assets/ScraperFields'
import type { Meta } from '@/types/stores'
import type { AssignedMeta } from '@shared/entities/meta'

export interface ScraperFieldTemplate {
  name: string
  type: string
  key: string
}

export interface EnsurePerformerScraperMetaResult {
  parentMeta: Meta
  createdParent: boolean
  createdFields: number
  pinnedFields: number
  mappedFields: number
}

type TranslateFn = (key: string, fallback?: string) => string

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

function iconForType(type: string): string {
  return DEFAULT_ICON_BY_TYPE[type] || 'shape'
}

export function getPerformerScraperFieldTemplates(): ScraperFieldTemplate[] {
  return (ScraperFields as ScraperFieldTemplate[]).map((field) => ({...field}))
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

async function ensureParentPerformerMeta({
  existingParent,
  allMeta,
  t,
}: {
  existingParent?: Meta | null
  allMeta: Meta[]
  t: TranslateFn
}): Promise<{parent: Meta; created: boolean; metas: Meta[]}> {
  if (existingParent?.id) {
    if (!existingParent.scraper) {
      await typedApi.updateMeta(existingParent.id, {scraper: true})
    }
    return {parent: {...existingParent, scraper: true}, created: false, metas: allMeta}
  }

  const parentName = t('scene_scraper.performers', 'Performers')
  const existing = findMetaByNameAndType(allMeta, parentName, 'array')
    || allMeta.find((meta) => meta.type === 'array' && Boolean(meta.scraper))

  if (existing) {
    if (!existing.scraper) {
      await typedApi.updateMeta(existing.id, {scraper: true})
    }
    return {parent: {...existing, scraper: true}, created: false, metas: allMeta}
  }

  const created = await typedApi.createMeta({
    type: 'array',
    name: parentName,
    icon: 'account-group',
    scraper: true,
    rating: true,
    favorite: true,
    synonyms: true,
    country: true,
    pageSetting: {page: 1},
  })

  const parent = created.data
  return {
    parent,
    created: true,
    metas: [...allMeta, parent],
  }
}

async function ensureChildMeta({
  field,
  allMeta,
  t,
}: {
  field: ScraperFieldTemplate
  allMeta: Meta[]
  t: TranslateFn
}): Promise<{meta: Meta; created: boolean; metas: Meta[]}> {
  const name = t(`scraper.fields.${field.key}`, field.name)
  const existing = findMetaByNameAndType(allMeta, name, field.type)
  if (existing) {
    return {meta: existing, created: false, metas: allMeta}
  }

  const created = await typedApi.createMeta({
    type: field.type,
    name,
    icon: iconForType(field.type),
    ...(field.type === 'array' ? {pageSetting: {page: 1}} : {}),
  })

  const meta = created.data
  return {
    meta,
    created: true,
    metas: [...allMeta, meta],
  }
}

/**
 * Creates the Performers tag category (if needed), all ScraperFields child meta,
 * pins them under the parent, and maps scraper keys. Idempotent for existing fields.
 */
export async function ensurePerformerScraperMeta({
  parentMeta,
  mediaTypeId,
  t,
}: {
  parentMeta?: Meta | null
  mediaTypeId?: number | null
  t: TranslateFn
}): Promise<EnsurePerformerScraperMetaResult> {
  const metaResponse = await typedApi.getMeta()
  let allMeta = metaResponse.data || []

  const {parent, created: createdParent, metas: afterParent} = await ensureParentPerformerMeta({
    existingParent: parentMeta,
    allMeta,
    t,
  })
  allMeta = afterParent

  // Mark this category as the active performer scraper target.
  for (const item of allMeta) {
    if (item.type !== 'array') continue
    if (item.id === parent.id) continue
    if (!item.scraper) continue
    await typedApi.updateMeta(item.id, {scraper: false})
  }
  await typedApi.updateMeta(parent.id, {scraper: true})

  if (mediaTypeId) {
    const assigned = await typedApi.getAssignedMetaForMediaType(mediaTypeId)
    const alreadyLinked = (assigned.data || []).some(
      (row) => Number(row.metaId) === Number(parent.id),
    )
    if (!alreadyLinked) {
      await typedApi.pinMetaToMediaType({
        metaId: parent.id,
        mediaTypeId,
        order: (assigned.data || []).length,
      })
    }
  }

  const pinnedResponse = await typedApi.getPinnedChildMeta(parent.id)
  const pinned: AssignedMeta[] = pinnedResponse.data || []
  const pinnedByChildId = new Map(
    pinned
      .filter((row) => row.pinnedMetaId != null)
      .map((row) => [Number(row.pinnedMetaId), row]),
  )

  let createdFields = 0
  let pinnedFields = 0
  let mappedFields = 0
  let order = pinned.length

  for (const field of getPerformerScraperFieldTemplates()) {
    const {meta, created, metas} = await ensureChildMeta({field, allMeta, t})
    allMeta = metas
    if (created) createdFields += 1

    let assignment = pinnedByChildId.get(Number(meta.id))
    if (!assignment) {
      await typedApi.pinChildMeta({
        metaId: parent.id,
        pinnedMetaId: meta.id,
        order,
      })
      order += 1
      pinnedFields += 1
      assignment = {
        metaId: parent.id,
        pinnedMetaId: meta.id,
        scraper: null,
      }
      pinnedByChildId.set(Number(meta.id), assignment)
    }

    if (assignment.scraper !== field.key) {
      await typedApi.updatePinnedMetaAssignment({
        metaId: parent.id,
        pinnedMetaId: meta.id,
        data: {scraper: field.key},
      })
      mappedFields += 1
    }
  }

  return {
    parentMeta: {...parent, scraper: true},
    createdParent,
    createdFields,
    pinnedFields,
    mappedFields,
  }
}
