import {typedApi} from '@/services/typedApi'
import TmdbScraperFields from '../assets/TmdbScraperFields'
import type {Meta} from '@/types/stores'
import type {AssignedMeta} from '@shared/entities/meta'

type TranslateFn = (key: string, fallback?: string) => string

const ICONS: Record<string, string> = {
  tmdb_release_date: 'calendar-outline',
  tmdb_studio: 'domain',
  tmdb_cast: 'account-group',
  tmdb_genres: 'tag-multiple-outline',
}

function normalizeName(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

export async function ensureTmdbScraperMeta({
  mediaTypeId,
  t,
}: {
  mediaTypeId: number
  t: TranslateFn
}): Promise<{createdFields: number; pinnedFields: number; mappedFields: number}> {
  const metaResponse = await typedApi.getMeta()
  let allMeta: Meta[] = metaResponse.data || []
  const assignedResponse = await typedApi.getAssignedMetaForMediaType(mediaTypeId)
  const assigned: AssignedMeta[] = assignedResponse.data || []
  const assignedByMetaId = new Map(
    assigned.filter((row) => row.metaId != null).map((row) => [Number(row.metaId), row]),
  )

  let createdFields = 0
  let pinnedFields = 0
  let mappedFields = 0
  let order = assigned.length

  for (const field of TmdbScraperFields) {
    const localized = t(`tmdb.fields.${field.key}`, field.name)
    let meta = allMeta.find(
      (item) => item.type === field.type && normalizeName(item.name) === normalizeName(localized),
    ) || allMeta.find(
      (item) => item.type === field.type && normalizeName(item.name) === normalizeName(field.name),
    )

    if (!meta) {
      const created = await typedApi.createMeta({
        type: field.type,
        name: localized,
        icon: ICONS[field.key] || 'shape',
        ...(field.type === 'array' ? {pageSetting: {page: 1}} : {}),
      })
      meta = created.data
      allMeta = [...allMeta, meta]
      createdFields += 1
    }

    let assignment = assignedByMetaId.get(Number(meta.id))
    if (!assignment) {
      await typedApi.pinMetaToMediaType({metaId: meta.id, mediaTypeId, order})
      order += 1
      pinnedFields += 1
      assignment = {metaId: meta.id, mediaTypeId, scraper: null}
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

  return {createdFields, pinnedFields, mappedFields}
}
