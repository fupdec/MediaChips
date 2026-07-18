import {typedApi} from '@/services/typedApi'
import TmdbPersonFields from '../assets/TmdbPersonFields'
import type {Meta} from '@/types/stores'
import type {AssignedMeta} from '@shared/entities/meta'

type TranslateFn = (key: string, fallback?: string) => string

const ICONS: Record<string, string> = {
  tmdb_birthday: 'cake-variant',
  tmdb_deathday: 'calendar-remove',
  tmdb_place_of_birth: 'map-marker-outline',
  tmdb_known_for: 'briefcase-outline',
  tmdb_gender: 'gender-male-female',
}

function normalizeName(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function findMetaByNameAndType(metas: Meta[], name: string, type: string): Meta | undefined {
  const target = normalizeName(name)
  return metas.find((meta) => meta.type === type && normalizeName(meta.name) === target)
}

/**
 * Creates/reuses Cast category + person fields, pins children, maps scraper keys.
 *
 * PinnedMeta row convention (same as adult performer scraper):
 *   metaId       = parent category id (Cast)
 *   pinnedMetaId = child field id (Birthday, …)
 */
export async function ensureTmdbPersonMeta({
  parentMetaId,
  mediaTypeId,
  t,
}: {
  parentMetaId?: number | null
  mediaTypeId?: number | null
  t: TranslateFn
}): Promise<{
  parentMeta: Meta
  createdParent: boolean
  createdFields: number
  pinnedFields: number
  mappedFields: number
}> {
  const metaResponse = await typedApi.getMeta()
  let allMeta: Meta[] = metaResponse.data || []

  let createdParent = false
  let parent: Meta | undefined

  if (parentMetaId) {
    parent = allMeta.find((meta) => Number(meta.id) === Number(parentMetaId))
  }

  if (!parent) {
    const castName = t('tmdb.fields.cast', 'Cast')
    parent = findMetaByNameAndType(allMeta, castName, 'array')
      || findMetaByNameAndType(allMeta, 'Performers', 'array')
  }

  if (!parent) {
    const created = await typedApi.createMeta({
      type: 'array',
      name: t('tmdb.fields.cast', 'Cast'),
      icon: 'account-group',
      color: true,
      rating: true,
      favorite: true,
      synonyms: true,
      country: true,
      pageSetting: {page: 1},
    })
    parent = created.data
    allMeta = [...allMeta, parent]
    createdParent = true
  }

  if (!parent?.id) {
    throw new Error('Failed to resolve Cast category')
  }

  // Enable synonyms on the Cast category (aliases from TMDB).
  if (!parent.synonyms) {
    await typedApi.updateMeta(parent.id, {synonyms: true})
    parent = {...parent, synonyms: true}
  }

  if (!parent.color) {
    await typedApi.updateMeta(parent.id, {color: true})
    parent = {...parent, color: true}
  }

  if (mediaTypeId) {
    const assignedResponse = await typedApi.getAssignedMetaForMediaType(mediaTypeId)
    const assigned = assignedResponse.data || []
    const alreadyLinked = assigned.some(
      (row) => Number(row.metaId) === Number(parent.id),
    )
    if (!alreadyLinked) {
      await typedApi.pinMetaToMediaType({
        metaId: parent.id,
        mediaTypeId,
        order: assigned.length,
      })
    } else {
      const castAssignment = assigned.find(
        (row) => Number(row.metaId) === Number(parent.id),
      )
      if (castAssignment && !castAssignment.scraper) {
        await typedApi.updateMetaInMediaTypeAssignment({
          metaId: parent.id,
          mediaTypeId,
          data: {scraper: 'tmdb_cast'},
        })
      }
    }
  }

  const pinnedResponse = await typedApi.getPinnedChildMeta(parent.id)
  const pinned: AssignedMeta[] = pinnedResponse.data || []
  // Child field id is stored in pinnedMetaId (adult convention).
  const pinnedByChildId = new Map(
    pinned
      .filter((row) => row.pinnedMetaId != null)
      .map((row) => [Number(row.pinnedMetaId), row]),
  )

  let createdFields = 0
  let pinnedFields = 0
  let mappedFields = 0
  let order = pinned.length

  for (const field of TmdbPersonFields) {
    const localized = t(`tmdb.person_fields.${field.key}`, field.name)
    let child = findMetaByNameAndType(allMeta, localized, field.type)
      || findMetaByNameAndType(allMeta, field.name, field.type)

    if (!child) {
      const created = await typedApi.createMeta({
        type: field.type,
        name: localized,
        icon: ICONS[field.key] || 'shape',
        ...(field.type === 'array' ? {pageSetting: {page: 1}} : {}),
      })
      child = created.data
      allMeta = [...allMeta, child]
      createdFields += 1
    }

    if (!child?.id) {
      throw new Error(`Failed to create meta for ${field.name}`)
    }

    let assignment = pinnedByChildId.get(Number(child.id))
    if (!assignment) {
      try {
        await typedApi.pinChildMeta({
          metaId: parent.id,
          pinnedMetaId: child.id,
          order,
        })
        pinnedFields += 1
      } catch (error) {
        // Already pinned (unique constraint) — continue and map scraper key.
        console.warn('pinChildMeta skipped:', error)
      }
      order += 1
      assignment = {
        metaId: parent.id,
        pinnedMetaId: child.id,
        scraper: null,
      }
      pinnedByChildId.set(Number(child.id), assignment)
    }

    if (assignment.scraper !== field.key) {
      await typedApi.updatePinnedMetaAssignment({
        metaId: parent.id,
        pinnedMetaId: child.id,
        data: {scraper: field.key},
      })
      mappedFields += 1
    }
  }

  return {
    parentMeta: parent,
    createdParent,
    createdFields,
    pinnedFields,
    mappedFields,
  }
}
