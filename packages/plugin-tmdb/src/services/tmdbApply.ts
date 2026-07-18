import path from 'path-browserify'
import {createImage} from '@/services/fileService'
import {typedApi} from '@/services/typedApi'
import {sortPinnedAssignmentItems} from '@/utils/pinnedMetaOrder'
import {findOrCreateTagByName} from '@/utils/tagLookup'
import type {AssignedMeta} from '@shared/entities/meta'
import type {MediaItem, Tag} from '@/types/stores'
import {ensureTmdbScraperMeta} from './ensureTmdbScraperMeta'
import {hasTmdbScraperMapping} from '../utils/tmdbFieldMapping'

export interface TmdbExtras {
  title: string | null
  release_date: string | null
  details: string | null
  studio: string | null
  cast: string[]
  genres: string[]
  image: string | null
  /** @deprecated server may still send adult-style keys */
  performers?: string[]
  tags?: string[]
}

export type TmdbApplyFieldKey =
  | 'title'
  | 'release_date'
  | 'studio'
  | 'cast'
  | 'genres'
  | 'poster'

/** UI/apply field → assignment.scraper key (TMDB-only, not adult scene keys). */
const FIELD_TO_SCRAPER: Record<Exclude<TmdbApplyFieldKey, 'title' | 'poster'>, string> = {
  release_date: 'tmdb_release_date',
  studio: 'tmdb_studio',
  cast: 'tmdb_cast',
  genres: 'tmdb_genres',
}

export function normalizeTmdbExtras(raw: Partial<TmdbExtras> | null | undefined): TmdbExtras {
  const cast = Array.isArray(raw?.cast)
    ? raw.cast
    : Array.isArray(raw?.performers)
      ? raw.performers
      : []
  const genres = Array.isArray(raw?.genres)
    ? raw.genres
    : Array.isArray(raw?.tags)
      ? raw.tags
      : []

  return {
    title: raw?.title ?? null,
    release_date: raw?.release_date ?? null,
    details: raw?.details ?? null,
    studio: raw?.studio ?? null,
    cast: cast.map((name) => String(name || '').trim()).filter(Boolean),
    genres: genres.map((name) => String(name || '').trim()).filter(Boolean),
    image: raw?.image ?? null,
  }
}

async function applyNames(
  metaId: number,
  names: string[],
  currentIds: number[],
  allTags: Tag[],
): Promise<number[]> {
  const next = [...currentIds]
  for (const name of names) {
    const trimmed = String(name || '').trim()
    if (!trimmed) continue
    const tagId = await findOrCreateTagByName(
      trimmed,
      metaId,
      allTags,
      (payload) => typedApi.createTags(payload),
    )
    if (!next.includes(tagId)) next.push(tagId)
  }
  return next
}

export async function applyTmdbExtrasToMedia({
  media,
  extras,
  selectedFields,
  mediaPath,
}: {
  media: MediaItem
  extras: TmdbExtras
  selectedFields: TmdbApplyFieldKey[]
  mediaPath: string
}): Promise<{success: boolean; posterFailed?: boolean; error?: string}> {
  const mediaId = Number(media.id)
  const selected = new Set(selectedFields)

  try {
    if (!media.mediaTypeId) throw new Error('mediaTypeId is required')

    const data = normalizeTmdbExtras(extras)

    // Always ensure all four TMDB mappings exist (idempotent).
    await ensureTmdbScraperMeta({
      mediaTypeId: Number(media.mediaTypeId),
      t: (_key, fallback) => fallback || _key,
    })

    const assigned = sortPinnedAssignmentItems(
      (await typedApi.getAssignedMetaForMediaType(media.mediaTypeId)).data || [],
    )

    if (!hasTmdbScraperMapping(assigned)) {
      return {
        success: false,
        error: 'No TMDB fields mapped. Open Settings → Plugins → TMDB → Configure TMDB fields.',
      }
    }

    const allTags: Tag[] = (await typedApi.getTags()).data || []
    const tagLinks = (await typedApi.getTagsInMedia(mediaId)).data || []
    const valueLinks = (await typedApi.getValuesInMedia(mediaId)).data || []

    if (selected.has('title') && data.title) {
      await typedApi.updateEntity('media', mediaId, {name: data.title})
    }

    const nextTags = tagLinks.map((entry) => ({
      mediaId,
      tagId: Number(entry.tagId),
      metaId: Number(entry.metaId),
    }))
    const nextValues = valueLinks.map((entry) => ({
      mediaId,
      metaId: Number(entry.metaId),
      value: entry.value,
    }))

    const findAssigned = (scraperKey: string): AssignedMeta | undefined =>
      assigned.find((item) => item.scraper === scraperKey)

    const skippedKeys: string[] = []

    for (const key of ['studio', 'cast', 'genres'] as const) {
      if (!selected.has(key)) continue
      const item = findAssigned(FIELD_TO_SCRAPER[key])
      const metaId = Number(item?.meta?.id ?? item?.metaId)
      if (!metaId) {
        skippedKeys.push(key)
        continue
      }
      const names = key === 'studio'
        ? (data.studio ? [data.studio] : [])
        : data[key]
      if (!names.length) continue
      const currentIds = nextTags.filter((link) => link.metaId === metaId).map((link) => link.tagId)
      const nextIds = await applyNames(metaId, names, currentIds, allTags)
      const kept = nextTags.filter((link) => link.metaId !== metaId)
      for (const tagId of nextIds) kept.push({mediaId, tagId, metaId})
      nextTags.length = 0
      nextTags.push(...kept)
    }

    if (selected.has('release_date') && data.release_date) {
      const item = findAssigned(FIELD_TO_SCRAPER.release_date)
      const metaId = Number(item?.meta?.id ?? item?.metaId)
      if (!metaId) {
        skippedKeys.push('release_date')
      } else {
        const kept = nextValues.filter((link) => link.metaId !== metaId)
        kept.push({mediaId, metaId, value: data.release_date})
        nextValues.length = 0
        nextValues.push(...kept)
      }
    }

    await typedApi.deleteItemTags('TagsInMedia', mediaId)
    if (nextTags.length) await typedApi.postItemTags('TagsInMedia', nextTags)
    await typedApi.deleteItemValues('ValuesInMedia', mediaId)
    if (nextValues.length) await typedApi.postItemValues('ValuesInMedia', nextValues)

    let posterFailed = false
    if (selected.has('poster') && data.image) {
      const outputPath = path.join(mediaPath, 'videos', 'thumbs', `${mediaId}.jpg`)
      const result = await createImage(data.image, outputPath, [
        {width: 300, height: 450},
        {width: 600, height: 900},
      ])
      posterFailed = result.status !== 201
    }

    if (skippedKeys.length) {
      return {
        success: true,
        posterFailed,
        error: `Saved, but unmapped fields were skipped: ${skippedKeys.join(', ')}. Configure TMDB fields in Settings.`,
      }
    }

    return {success: true, posterFailed}
  } catch (error) {
    return {success: false, error: error instanceof Error ? error.message : String(error)}
  }
}
