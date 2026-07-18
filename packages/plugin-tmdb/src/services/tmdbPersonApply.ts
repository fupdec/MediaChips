import path from 'path-browserify'
import {createImage} from '@/services/fileService'
import {typedApi} from '@/services/typedApi'
import {useItemsStore} from '@/stores/items'
import {sortPinnedAssignmentItems} from '@/utils/pinnedMetaOrder'
import {findOrCreateTagByName} from '@/utils/tagLookup'
import {serializeCountries} from '@/utils/country'
import {refreshTagThumbDisplay} from '@/utils/tagThumbRefresh'
import {
  DEFAULT_TAG_COLOR,
  extractColorFromLocalFile,
  isDefaultTagColor,
} from '@/utils/colorFromImage'
import type {AssignedMeta} from '@shared/entities/meta'
import type {Meta, Tag} from '@/types/stores'
import {ensureTmdbPersonMeta} from './ensureTmdbPersonMeta'

export interface TmdbPersonExtras {
  name: string | null
  synonyms: string | null
  bio: string | null
  birthday: string | null
  deathday: string | null
  place_of_birth: string | null
  known_for: string | null
  gender: string | null
  image: string | null
}

export type TmdbPersonApplyFieldKey =
  | 'name'
  | 'synonyms'
  | 'bio'
  | 'birthday'
  | 'deathday'
  | 'place_of_birth'
  | 'known_for'
  | 'gender'
  | 'image'

const FIELD_TO_SCRAPER: Record<
  Exclude<TmdbPersonApplyFieldKey, 'name' | 'synonyms' | 'bio' | 'image'>,
  string
> = {
  birthday: 'tmdb_birthday',
  deathday: 'tmdb_deathday',
  place_of_birth: 'tmdb_place_of_birth',
  known_for: 'tmdb_known_for',
  gender: 'tmdb_gender',
}

type MetaFieldValue = string | number | boolean | string[] | number[] | null | undefined

function getChildMetaId(item: AssignedMeta | undefined): number {
  if (!item) return NaN
  // Pinned-child rows: meta is the child field; pinnedMetaId is also the child id.
  return Number(item.meta?.id ?? item.pinnedMetaId ?? item.metaId)
}

/** Prefer a mid-size TMDB asset — `original` profiles are large and often fail to download in time. */
export function toTmdbProfileDownloadUrl(url: string): string {
  return String(url || '').replace(/\/t\/p\/original\//, '/t/p/w780/')
}

export async function applyTmdbPersonExtrasToTag({
  tag,
  meta,
  extras,
  selectedFields,
  dbPath,
}: {
  tag: Tag
  meta: Meta
  extras: TmdbPersonExtras
  selectedFields: TmdbPersonApplyFieldKey[]
  dbPath: string
}): Promise<{success: boolean; imageFailed?: boolean; error?: string}> {
  const tagId = Number(tag.id)
  const selected = new Set(selectedFields)

  try {
    await ensureTmdbPersonMeta({
      parentMetaId: Number(meta.id),
      t: (_key, fallback) => fallback || _key,
    })

    const assigned = sortPinnedAssignmentItems(
      (await typedApi.getPinnedChildMeta(meta.id)).data || [],
    )
    const allTags: Tag[] = (await typedApi.getTags()).data || []
    const tagLinks = (await typedApi.getTagsInTag(tagId)).data || []
    const valueLinks = (await typedApi.getValuesInTag(tagId)).data || []

    const findAssigned = (scraperKey: string): AssignedMeta | undefined =>
      assigned.find((item) => item.scraper === scraperKey)

    const entityUpdate: Record<string, MetaFieldValue> = {}
    if (selected.has('name') && extras.name) entityUpdate.name = extras.name
    if (selected.has('synonyms') && extras.synonyms != null) {
      entityUpdate.synonyms = extras.synonyms
    }
    if (selected.has('bio') && extras.bio != null) {
      entityUpdate.bookmark = extras.bio
    }

    // Keep existing country serialization if present on tag.
    if (tag.country != null) {
      entityUpdate.country = Array.isArray(tag.country)
        ? serializeCountries(tag.country)
        : tag.country
    }

    const nextTags = tagLinks.map((entry) => ({
      parentTagId: tagId,
      tagId: Number(entry.tagId),
      metaId: Number(entry.metaId),
    }))
    const nextValues = valueLinks.map((entry) => ({
      tagId,
      metaId: Number(entry.metaId),
      value: entry.value,
    }))

    const skippedKeys: string[] = []

    for (const key of ['birthday', 'deathday', 'place_of_birth', 'known_for'] as const) {
      if (!selected.has(key)) continue
      const value = extras[key]
      if (value == null || value === '') continue
      const item = findAssigned(FIELD_TO_SCRAPER[key])
      const metaId = getChildMetaId(item)
      if (!metaId) {
        skippedKeys.push(key)
        continue
      }
      const kept = nextValues.filter((link) => link.metaId !== metaId)
      kept.push({tagId, metaId, value})
      nextValues.length = 0
      nextValues.push(...kept)
    }

    if (selected.has('gender') && extras.gender) {
      const item = findAssigned(FIELD_TO_SCRAPER.gender)
      const metaId = getChildMetaId(item)
      if (!metaId) {
        skippedKeys.push('gender')
      } else {
        const genderTagId = await findOrCreateTagByName(
          extras.gender,
          metaId,
          allTags,
          (payload) => typedApi.createTags(payload),
        )
        const kept = nextTags.filter((link) => link.metaId !== metaId)
        kept.push({parentTagId: tagId, tagId: genderTagId, metaId})
        nextTags.length = 0
        nextTags.push(...kept)
      }
    }

    let imageFailed = false
    if (selected.has('image') && extras.image) {
      const imagePath = path.join(dbPath, 'meta', String(meta.id), `${tagId}_main.jpg`)
      const aspectRatio = Number(meta.imageAspectRatio) || 1
      const sizes = {width: 300, height: 300 / aspectRatio}
      const downloadUrl = toTmdbProfileDownloadUrl(extras.image)
      const result = await createImage(downloadUrl, imagePath, sizes)
      imageFailed = result.status !== 201

      if (!imageFailed) {
        // Clear negative file-exists / thumb caches so the new poster shows up immediately.
        try {
          refreshTagThumbDisplay(useItemsStore(), dbPath, meta.id, tagId)
        } catch {
          // stores may be unavailable outside app context
        }

        if (
          meta.autoColorFromImage
          && meta.color
          && isDefaultTagColor(
            (entityUpdate.color as string | null | undefined)
              ?? (tag.color as string | null | undefined)
              ?? DEFAULT_TAG_COLOR,
          )
        ) {
          const color = await extractColorFromLocalFile(imagePath)
          if (!isDefaultTagColor(color)) {
            entityUpdate.color = color
          }
        }
      }
    }

    if (Object.keys(entityUpdate).length) {
      await typedApi.updateEntity('tag', tagId, entityUpdate)
    }

    await typedApi.deleteItemTags('TagsInTag', tagId)
    if (nextTags.length) await typedApi.postItemTags('TagsInTag', nextTags)
    await typedApi.deleteItemValues('ValuesInTag', tagId)
    if (nextValues.length) await typedApi.postItemValues('ValuesInTag', nextValues)

    if (skippedKeys.length) {
      return {
        success: true,
        imageFailed,
        error: `Saved, but unmapped fields were skipped: ${skippedKeys.join(', ')}. Configure person fields in Settings → TMDB.`,
      }
    }

    return {success: true, imageFailed}
  } catch (error) {
    return {success: false, error: error instanceof Error ? error.message : String(error)}
  }
}
