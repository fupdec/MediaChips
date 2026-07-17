import { typedApi } from '@/services/typedApi'
import { matchScraperScenes } from './sceneScraperApi'
import { applySceneScrapedTagNames } from './sceneScraperApply'
import { applyScenePosterToVideoThumb } from './sceneScraperPoster'
import { applySceneMarkersFromTpdb } from './sceneScraperApi'
import { applySelectedSceneMarkers } from './sceneScraperMarkers'
import { useSettingsStore } from '@/stores/settings'
import { buildSceneTransferFields } from '../utils/buildSceneTransferFields'
import { buildSceneSearchQueryFromFilename } from '@/utils/sceneSearchQuery'
import { applyTransferAllToFields } from '../utils/sceneTransferApply'
import { pickBestSceneImage } from '../utils/sceneScraperPoster'
import { sortPinnedAssignmentItems } from '@/utils/pinnedMetaOrder'
import { parseMetaBooleanValue, serializeMetaBooleanValue } from '@shared/schemas/coercion'
import type { AssignedMeta } from '@shared/entities/meta'
import type { EntityUpdatePayload, TagInTagEntry, ValueInTagEntry } from '@shared/api/responses'
import type { ItemTagRef, ItemValueRef, MediaItem, Tag } from '@/types/stores'
import type { SceneScraperMarkerEntry, SceneScraperScene } from '../types/sceneScraper'
import type { ScraperPinnedItem, ScraperTransferField } from '../types/scraper'

export type SceneAutoApplyError =
  | 'not_exact_match'
  | 'not_found'
  | 'no_config'
  | 'save_failed'
  | 'api_error'

export interface SceneAutoApplyResult {
  success: boolean
  mediaId: number
  mediaName?: string | null
  mediaBookmark?: string | null
  sceneTitle?: string | null
  markersImported?: number
  mediaTags?: ItemTagRef[]
  mediaValues?: ItemValueRef[]
  posterFailed?: boolean
  error?: SceneAutoApplyError
}

type MediaFieldValue = string | number | boolean | string[] | number[] | null | undefined

interface MediaValues {
  name?: string | null
  rating?: number
  favorite?: number
  views?: number
  bookmark?: string | null
  [key: string]: MediaFieldValue
}

interface TagInMediaPayload {
  mediaId: number
  tagId: number
  metaId: number
}

interface ValueInMediaPayload {
  value: unknown
  mediaId: number
  metaId: number
}

export function isExactOshashMatch(
  matchMethod: string | null | undefined,
  sceneCount: number,
): boolean {
  return matchMethod === 'oshash' && sceneCount === 1
}

export function hasSceneScraperMapping(assignedItems: AssignedMeta[]): boolean {
  return assignedItems.some((item) => Boolean(item.scraper))
}

function getDefaultMetaValue(type?: string): MediaFieldValue {
  if (type === 'array') return []
  if (type === 'boolean') return false
  if (type === 'number' || type === 'rating') return 0
  return null
}

function getAssignedItemKey(item: AssignedMeta): string | number | undefined {
  return item.pinnedMetaId ?? item.meta?.id ?? item.metaId
}

function getAssignedItemByMetaId(
  assignedItems: AssignedMeta[],
  metaId: number,
): AssignedMeta | undefined {
  return assignedItems.find(
    (item) => Number(item.meta?.id ?? item.metaId) === Number(metaId),
  )
}

function getStorageKeyForMetaId(
  assignedItems: AssignedMeta[],
  metaId: number,
): string | number {
  const assignedItem = getAssignedItemByMetaId(assignedItems, metaId)
  return assignedItem ? (getAssignedItemKey(assignedItem) ?? metaId) : metaId
}

function normalizeEntityFieldValue(key: string, value: MediaFieldValue): MediaFieldValue {
  switch (key) {
    case 'rating':
    case 'views':
      return value == null || value === '' ? 0 : Number(value) || 0
    case 'favorite':
      return value === true || value === 1 ? 1 : 0
    case 'bookmark':
      return value == null || value === '' ? null : value
    case 'name':
      return typeof value === 'string' ? value.trim() : value
    default:
      return value
  }
}

function buildEntityUpdateData(vals: MediaValues): EntityUpdatePayload {
  const updateData: Record<string, MediaFieldValue> = {}
  const fieldKeys = ['name', 'rating', 'favorite', 'views', 'bookmark'] as const

  for (const key of fieldKeys) {
    if (!(key in vals)) continue
    updateData[key] = normalizeEntityFieldValue(key, vals[key])
  }

  return updateData as EntityUpdatePayload
}

function seedMediaEntityFields(vals: MediaValues, media: MediaItem) {
  vals.name = media.name ?? null
  vals.rating = Number(media.rating) || 0
  vals.favorite = Number(media.favorite) || 0
  vals.views = Number(media.views) || 0
  vals.bookmark = media.bookmark ?? null
}

async function loadAssignedMetaForMedia(media: MediaItem): Promise<AssignedMeta[]> {
  const mediaTypeId = media.mediaTypeId
  if (!mediaTypeId) return []

  const response = await typedApi.getAssignedMetaForMediaType(mediaTypeId)
  return sortPinnedAssignmentItems(response.data)
}

async function loadMediaValues(
  media: MediaItem,
  assignedItems: AssignedMeta[],
): Promise<MediaValues> {
  const [tagsResponse, valuesResponse] = await Promise.all([
    typedApi.getTagsInMedia(media.id),
    typedApi.getValuesInMedia(media.id),
  ])

  const vals: MediaValues = {}
  seedMediaEntityFields(vals, media)

  for (const item of assignedItems) {
    const key = getAssignedItemKey(item)
    if (key == null) continue
    vals[key] = getDefaultMetaValue(item.meta?.type)
  }

  for (const value of valuesResponse.data as ValueInTagEntry[]) {
    const item = assignedItems.find(
      (entry) => Number(getAssignedItemKey(entry)) === Number(value.metaId),
    )
    const key = item ? getAssignedItemKey(item) : value.metaId
    if (key == null) continue

    let val = value.value
    if (item?.meta?.type === 'rating') {
      val = Number(val) || 0
    } else if (item?.meta?.type === 'boolean') {
      val = parseMetaBooleanValue(val)
    }

    vals[key] = val as MediaFieldValue
  }

  const parsedTags: Record<string, number[]> = {}
  for (const tagEntry of tagsResponse.data as TagInTagEntry[]) {
    const metaIdKey = String(tagEntry.metaId)
    if (!parsedTags[metaIdKey]) {
      parsedTags[metaIdKey] = [tagEntry.tagId]
    } else {
      parsedTags[metaIdKey].push(tagEntry.tagId)
    }
  }

  for (const metaId in parsedTags) {
    const item = assignedItems.find(
      (entry) => String(getAssignedItemKey(entry)) === metaId,
    )
    const key = item ? getAssignedItemKey(item) : metaId
    if (key == null) continue
    vals[key] = parsedTags[metaId]
  }

  return vals
}

async function applyTransferredFieldsToMediaValues({
  fields,
  vals,
  allTags,
  assignedItems,
}: {
  fields: ScraperTransferField[]
  vals: MediaValues
  allTags: Tag[]
  assignedItems: AssignedMeta[]
}) {
  for (const field of fields) {
    if (!field.isTransfered) continue

    if (field.dataType === 'bookmark') {
      vals.bookmark = field.valueCurrent as string | null
      continue
    }

    if (field.dataType === 'mediaName') {
      const nextName = String(field.valueCurrent ?? '').trim()
      vals.name = nextName || null
      continue
    }

    const metaId = Number(field.meta.id)
    const storageKey = getStorageKeyForMetaId(assignedItems, metaId)

    if (field.dataType === 'array') {
      // valueCurrent is the authoritative name list from the transfer UI.
      vals[storageKey] = await applySceneScrapedTagNames({
        metaId,
        names: field.valueCurrent,
        currentTagIds: [],
        allTags,
      })
      continue
    }

    vals[storageKey] = field.valueCurrent as MediaFieldValue
  }
}

async function saveMediaValues(
  mediaId: number,
  vals: MediaValues,
  assignedItems: AssignedMeta[],
): Promise<void> {
  const tags: TagInMediaPayload[] = []
  const values: ValueInMediaPayload[] = []
  const assignedKeys = new Set(
    assignedItems.map((item) => String(getAssignedItemKey(item))),
  )

  for (const key in vals) {
    const isMeta = /^\d+$/.test(String(key))
    if (!isMeta || !assignedKeys.has(String(key))) continue

    let val = vals[key]
    const assignedItem = assignedItems.find(
      (item) => String(getAssignedItemKey(item)) === String(key),
    )
    const metaType = assignedItem?.meta?.type
    const metaId = Number(assignedItem?.meta?.id ?? assignedItem?.metaId ?? key)
    if (!Number.isFinite(metaId) || metaId <= 0) continue

    if (metaType === 'boolean') {
      val = serializeMetaBooleanValue(val)
    } else if (typeof val === 'string') {
      val = val.trim()
      if (val.length === 0) val = null
    } else if (Array.isArray(val)) {
      for (const rawId of val) {
        const tagId = Number(rawId)
        if (!Number.isFinite(tagId) || tagId <= 0) continue
        tags.push({
          mediaId,
          tagId,
          metaId,
        })
      }
      continue
    }

    if (!Array.isArray(val)) {
      values.push({
        value: val,
        mediaId,
        metaId,
      })
    }
  }

  await typedApi.updateEntity('media', mediaId, buildEntityUpdateData(vals))
  await typedApi.deleteItemTags('TagsInMedia', mediaId)

  if (tags.length > 0) {
    await typedApi.postItemTags('TagsInMedia', tags)
  }

  await typedApi.deleteItemValues('ValuesInMedia', mediaId)

  if (values.length > 0) {
    await typedApi.postItemValues('ValuesInMedia', values)
  }
}

async function readMediaCardRelations(mediaId: number): Promise<{
  mediaTags: ItemTagRef[]
  mediaValues: ItemValueRef[]
}> {
  const [tagsResponse, valuesResponse] = await Promise.all([
    typedApi.getTagsInMedia(mediaId),
    typedApi.getValuesInMedia(mediaId),
  ])

  const mediaTags: ItemTagRef[] = (tagsResponse.data || []).map((entry) => ({
    tagId: Number(entry.tagId),
    metaId: Number(entry.metaId),
  })).filter((entry) => Number.isFinite(entry.tagId) && Number.isFinite(entry.metaId))

  const mediaValues: ItemValueRef[] = (valuesResponse.data || []).map((entry) => ({
    metaId: Number(entry.metaId),
    value: entry.value,
  })).filter((entry) => Number.isFinite(entry.metaId))

  return {mediaTags, mediaValues}
}

function buildSearchQuery(media: MediaItem): string {
  const filename = String(
    media.basename || media.name || media.path?.split('/').pop() || '',
  )
  return buildSceneSearchQueryFromFilename(filename)
}

/** Load pinned meta + current media values for the transfer UI when the editor is closed. */
export async function loadSceneTransferContext(media: MediaItem): Promise<{
  assignedItems: AssignedMeta[]
  currentValues: MediaValues
}> {
  const assignedItems = await loadAssignedMetaForMedia(media)
  const currentValues = await loadMediaValues(media, assignedItems)
  return {assignedItems, currentValues}
}

/**
 * Persist a manual scene-scraper transfer (selected fields / poster / markers).
 * Unlike auto-apply, field selection comes from the transfer UI.
 */
export async function applyManualSceneTransferToMedia({
  media,
  fields,
  allTags,
  mediaPath,
  mediaTypeFolder = 'videos',
  selectedPosterUrl = null,
  markers = [],
  sceneTitle = null,
}: {
  media: MediaItem
  fields: ScraperTransferField[]
  allTags: Tag[]
  mediaPath: string
  mediaTypeFolder?: string
  selectedPosterUrl?: string | null
  markers?: SceneScraperMarkerEntry[]
  sceneTitle?: string | null
}): Promise<SceneAutoApplyResult> {
  const mediaId = Number(media.id)

  try {
    const assignedItems = await loadAssignedMetaForMedia(media)
    if (!hasSceneScraperMapping(assignedItems)) {
      return {
        success: false,
        mediaId,
        mediaName: media.name,
        sceneTitle,
        error: 'no_config',
      }
    }

    const vals = await loadMediaValues(media, assignedItems)
    await applyTransferredFieldsToMediaValues({fields, vals, allTags, assignedItems})

    const posterUrl = String(selectedPosterUrl || '').trim()
    let posterFailed = false
    if (posterUrl) {
      const posterResult = await applyScenePosterToVideoThumb({
        url: posterUrl,
        mediaId,
        mediaPath,
        mediaTypeFolder,
        mediaWidth: media.width,
        mediaHeight: media.height,
      })
      posterFailed = !posterResult.success
    }

    await saveMediaValues(mediaId, vals, assignedItems)

    let markersImported = 0
    const settingsStore = useSettingsStore()
    if (markers.length) {
      const markerMetaId = Number(settingsStore.sceneScraperMarkerMetaId) || null
      markersImported = await applySelectedSceneMarkers({
        mediaId,
        markers,
        markerMetaId,
        allTags,
      })
    }

    // Re-read relations from DB so the card update matches what was persisted.
    const relations = await readMediaCardRelations(mediaId)

    return {
      success: true,
      mediaId,
      mediaName: typeof vals.name === 'string' ? vals.name : media.name,
      mediaBookmark: typeof vals.bookmark === 'string' || vals.bookmark == null
        ? (vals.bookmark as string | null)
        : media.bookmark ?? null,
      sceneTitle,
      markersImported,
      posterFailed,
      mediaTags: relations.mediaTags,
      mediaValues: relations.mediaValues,
    }
  } catch (error) {
    console.error('Manual scene transfer failed:', error)
    return {
      success: false,
      mediaId,
      mediaName: media.name,
      sceneTitle,
      error: 'save_failed',
    }
  }
}

export async function autoApplySceneToMedia({
  media,
  scene,
  assignedItems,
  allTags,
  mediaPath,
  mediaTypeFolder = 'videos',
  applyPoster = true,
}: {
  media: MediaItem
  scene: SceneScraperScene
  assignedItems: AssignedMeta[]
  allTags: Tag[]
  mediaPath: string
  mediaTypeFolder?: string
  applyPoster?: boolean
}): Promise<SceneAutoApplyResult> {
  const mediaId = Number(media.id)

  try {
    if (!hasSceneScraperMapping(assignedItems)) {
      return {
        success: false,
        mediaId,
        mediaName: media.name,
        error: 'no_config',
      }
    }

    const pinned = assignedItems.filter((item) => item.scraper) as ScraperPinnedItem[]
    const currentValues = await loadMediaValues(media, assignedItems)
    const fields = applyTransferAllToFields(buildSceneTransferFields({
      scene,
      pinned,
      currentValues,
      tags: allTags,
      performerGender: useSettingsStore().scraperPerformerGender,
    }))

    const vals = {...currentValues}
    await applyTransferredFieldsToMediaValues({fields, vals, allTags, assignedItems})

    let posterFailed = false
    if (applyPoster) {
      const poster = pickBestSceneImage(scene.images)
      if (poster?.url) {
        const posterResult = await applyScenePosterToVideoThumb({
          url: poster.url,
          mediaId,
          mediaPath,
          mediaTypeFolder,
          mediaWidth: media.width,
          mediaHeight: media.height,
        })
        posterFailed = !posterResult.success
      }
    }

    await saveMediaValues(mediaId, vals, assignedItems)

    let markersImported = 0
    const settingsStore = useSettingsStore()
    if (settingsStore.sceneScraperImportMarkers === '1') {
      try {
        const markerMetaId = Number(settingsStore.sceneScraperMarkerMetaId) || null
        const markerResult = await applySceneMarkersFromTpdb({
          sceneId: scene.id,
          mediaId,
          markerMetaId,
        })
        markersImported = markerResult.imported
      } catch (error) {
        console.error('Scene marker import failed:', error)
      }
    }

    const relations = await readMediaCardRelations(mediaId)

    return {
      success: true,
      mediaId,
      mediaName: typeof vals.name === 'string' ? vals.name : media.name,
      mediaBookmark: typeof vals.bookmark === 'string' || vals.bookmark == null
        ? (vals.bookmark as string | null)
        : media.bookmark ?? null,
      sceneTitle: scene.title,
      markersImported,
      posterFailed,
      mediaTags: relations.mediaTags,
      mediaValues: relations.mediaValues,
    }
  } catch (error) {
    console.error('Scene auto-apply failed:', error)
    return {
      success: false,
      mediaId,
      mediaName: media.name,
      sceneTitle: scene.title,
      error: 'save_failed',
    }
  }
}

export async function matchAndAutoApplySceneToMedia({
  media,
  allTags,
  mediaPath,
  mediaTypeFolder = 'videos',
  applyPoster = true,
  requireExactOshash = true,
}: {
  media: MediaItem
  allTags: Tag[]
  mediaPath: string
  mediaTypeFolder?: string
  applyPoster?: boolean
  requireExactOshash?: boolean
}): Promise<SceneAutoApplyResult> {
  const mediaId = Number(media.id)
  const assignedItems = await loadAssignedMetaForMedia(media)

  if (!hasSceneScraperMapping(assignedItems)) {
    return {
      success: false,
      mediaId,
      mediaName: media.name,
      error: 'no_config',
    }
  }

  let matchResult
  try {
    matchResult = await matchScraperScenes({
      mediaId,
      query: buildSearchQuery(media),
      limit: 1,
    })
  } catch (error) {
    console.error('Scene match failed:', error)
    return {
      success: false,
      mediaId,
      mediaName: media.name,
      error: 'api_error',
    }
  }

  const scenes = matchResult.data || []
  if (!scenes.length) {
    return {
      success: false,
      mediaId,
      mediaName: media.name,
      error: 'not_found',
    }
  }

  if (requireExactOshash && !isExactOshashMatch(matchResult.matchMethod, scenes.length)) {
    return {
      success: false,
      mediaId,
      mediaName: media.name,
      error: 'not_exact_match',
    }
  }

  return autoApplySceneToMedia({
    media,
    scene: scenes[0],
    assignedItems,
    allTags,
    mediaPath,
    mediaTypeFolder,
    applyPoster,
  })
}
