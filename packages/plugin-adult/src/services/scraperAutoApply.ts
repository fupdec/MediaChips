import path from 'path-browserify'
import orderBy from 'lodash/orderBy'
import { typedApi } from '@/services/typedApi'
import { createImage } from '@/services/fileService'
import { parseCountries, serializeCountries } from '@/utils/country'
import { sortPinnedAssignmentItems } from '@/utils/pinnedMetaOrder'
import { buildScraperTransferFields, mergeBookmarkValues, mergeSynonymValues } from '@/utils/scraperTransferFields'
import {
  DEFAULT_TAG_COLOR,
  extractColorFromLocalFile,
  isDefaultTagColor,
} from '@/utils/colorFromImage'
import { parseMetaBooleanValue, serializeMetaBooleanValue } from '@shared/schemas/coercion'
import type { AssignedMeta } from '@shared/entities/meta'
import type { EntityUpdatePayload } from '@shared/api/responses'
import type { Meta, Tag } from '@/types/stores'
import type {
  ScraperPerformer,
  ScraperPinnedItem,
  ScraperPoster,
  ScraperTransferField,
} from '@/types/scraper'

type MetaFieldValue = string | number | boolean | string[] | number[] | null | undefined

interface TagValues {
  name?: string | null
  color?: string | null
  synonyms?: string | null
  rating?: number
  favorite?: number
  views?: number
  bookmark?: string | null
  country?: string[] | null
  [key: string]: MetaFieldValue
}

interface TagInTagPayload {
  parentTagId: number
  tagId: number
  metaId: number
}

interface ValueInTagPayload {
  value: unknown
  tagId: number
  metaId: number
}

export interface AutoScrapeApplyParams {
  tag: Tag
  meta: Meta
  performer: ScraperPerformer
  dbPath: string
  allTags: Tag[]
}

export interface AutoScrapeApplyResult {
  success: boolean
  performerName?: string
  createdTagIds?: number[]
  error?: string
}

function getDefaultMetaValue(type?: string): MetaFieldValue {
  if (type === 'array') return []
  if (type === 'boolean') return false
  if (type === 'number' || type === 'rating') return 0
  return null
}

function pickBestPoster(posters: ScraperPoster[] = []): ScraperPoster | null {
  if (!posters.length) return null
  return orderBy(posters, ['size'], ['desc'])[0] || null
}

async function findOrCreateTagByName(
  name: string,
  metaId: number,
  allTags: Tag[],
): Promise<number> {
  const existing = allTags.find(
    (tag) => tag.metaId === metaId && tag.name?.toLowerCase() === name.toLowerCase(),
  )
  if (existing) return existing.id

  const response = await typedApi.createTags([{ name, metaId }])
  const created = response.data[0]
  allTags.push({
    ...created,
    id: created.id,
    name: created.name || name,
    metaId,
  } as Tag)
  return created.id
}

async function loadTagValues(
  tag: Tag,
  assignedItems: AssignedMeta[],
): Promise<TagValues> {
  const [tagsResponse, valuesResponse] = await Promise.all([
    typedApi.getTagsInTag(tag.id),
    typedApi.getValuesInTag(tag.id),
  ])

  const vals: TagValues = {
    country: parseCountries(tag.country as string | undefined),
    name: tag.name || null,
    color: (tag.color as string | undefined) || DEFAULT_TAG_COLOR,
    synonyms: tag.synonyms || null,
    rating: Number(tag.rating) || 0,
    favorite: Number(tag.favorite) || 0,
    views: Number(tag.views) || 0,
    bookmark: tag.bookmark || null,
  }

  for (const item of assignedItems) {
    const key = item.pinnedMetaId ?? item.meta?.id
    if (key == null) continue
    vals[key] = getDefaultMetaValue(item.meta?.type)
  }

  for (const value of valuesResponse.data) {
    const item = assignedItems.find(
      (entry) => Number(entry.pinnedMetaId ?? entry.meta?.id) === Number(value.metaId),
    )
    let val = value.value

    if (item?.meta?.type === 'rating') {
      val = Number(val)
      if (Number.isNaN(val)) val = 0
    } else if (item?.meta?.type === 'boolean') {
      val = parseMetaBooleanValue(val)
    }

    const key = item?.pinnedMetaId ?? value.metaId
    vals[key] = val as MetaFieldValue
  }

  const parsedTags: Record<string, number[]> = {}
  for (const tagEntry of tagsResponse.data) {
    const metaIdKey = String(tagEntry.metaId)
    if (!parsedTags[metaIdKey]) {
      parsedTags[metaIdKey] = [tagEntry.tagId]
    } else {
      parsedTags[metaIdKey].push(tagEntry.tagId)
    }
  }

  for (const metaId in parsedTags) {
    const item = assignedItems.find(
      (entry) => String(entry.pinnedMetaId ?? entry.meta?.id) === metaId,
    )
    const key = item?.pinnedMetaId ?? metaId
    vals[key] = parsedTags[metaId]
  }

  return vals
}

async function applyTransferFields({
  fields,
  vals,
  allTags,
}: {
  fields: ScraperTransferField[]
  vals: TagValues
  allTags: Tag[]
}): Promise<void> {
  for (const field of fields) {
    if (field.dataType === 'array') {
      const metaId = field.meta.id
      const valueName = String(field.valueScraper || '').trim()
      if (!valueName) continue

      if (field.isTagExists) {
        const tag = allTags.find(
          (entry) => entry.metaId === metaId && entry.name === field.valueScraper,
        )
        vals[metaId] = tag ? [tag.id] : []
      } else {
        const tagId = await findOrCreateTagByName(valueName, metaId, allTags)
        vals[metaId] = [tagId]
      }
      continue
    }

    if (field.dataType === 'country') {
      vals.country = Array.isArray(field.valueScraper)
        ? [...field.valueScraper]
        : field.valueScraper
          ? [String(field.valueScraper)]
          : []
      continue
    }

    if (field.dataType === 'synonyms') {
      const merged = mergeSynonymValues(vals.synonyms, field.valueScraper)
      vals.synonyms = merged || null
      continue
    }

    if (field.dataType === 'bookmark') {
      const merged = mergeBookmarkValues(vals.bookmark, field.valueScraper)
      vals.bookmark = merged || null
      continue
    }

    vals[field.meta.id] = field.valueScraper as MetaFieldValue
  }
}

function normalizeEntityFieldValue(key: string, value: MetaFieldValue): MetaFieldValue {
  switch (key) {
    case 'rating':
    case 'views':
      return value == null || value === '' ? 0 : Number(value) || 0
    case 'favorite':
      return value === true || value === 1 ? 1 : 0
    case 'synonyms':
    case 'bookmark':
    case 'color':
      return value == null || value === '' ? null : value
    case 'name':
      return typeof value === 'string' ? value.trim() : value
    default:
      return value
  }
}

function buildEntityUpdateData(vals: TagValues): EntityUpdatePayload {
  const {country, ...rest} = vals
  const updateData: Record<string, MetaFieldValue> = {}
  const fieldKeys = ['name', 'color', 'synonyms', 'rating', 'favorite', 'views', 'bookmark'] as const

  for (const key of fieldKeys) {
    if (!(key in rest)) continue
    updateData[key] = normalizeEntityFieldValue(key, rest[key])
  }

  updateData.country = country?.length ? serializeCountries(country) : null
  return updateData as EntityUpdatePayload
}

async function saveTagValues(
  tagId: number,
  vals: TagValues,
  assignedItems: AssignedMeta[],
): Promise<void> {
  const tags: TagInTagPayload[] = []
  const values: ValueInTagPayload[] = []
  const assignedKeys = new Set(
    assignedItems.map((item) => String(item.pinnedMetaId ?? item.meta?.id)),
  )

  for (const key in vals) {
    const isMeta = /\d/.test(key)
    if (!isMeta || !assignedKeys.has(String(key))) continue

    let val = vals[key]
    const assignedItem = assignedItems.find(
      (item) => String(item.pinnedMetaId ?? item.meta?.id) === String(key),
    )
    const metaType = assignedItem?.meta?.type
    const metaId = Number(key)

    if (metaType === 'boolean') {
      val = serializeMetaBooleanValue(val)
    } else if (typeof val === 'string') {
      val = val.trim()
      if (val.length === 0) val = null
    } else if (Array.isArray(val)) {
      for (const childTagId of val as number[]) {
        tags.push({
          parentTagId: tagId,
          tagId: childTagId,
          metaId,
        })
      }
    }

    if (!Array.isArray(val)) {
      values.push({
        value: val,
        tagId,
        metaId,
      })
    }
  }

  await typedApi.updateEntity('tag', tagId, buildEntityUpdateData(vals))
  await typedApi.deleteItemTags('TagsInTag', tagId)

  if (tags.length > 0) {
    await typedApi.postItemTags('TagsInTag', tags)
  }

  await typedApi.deleteItemValues('ValuesInTag', tagId)

  if (values.length > 0) {
    await typedApi.postItemValues('ValuesInTag', values)
  }
}

async function downloadMainImage({
  performer,
  meta,
  tag,
  dbPath,
  vals,
}: {
  performer: ScraperPerformer
  meta: Meta
  tag: Tag
  dbPath: string
  vals: TagValues
}): Promise<boolean> {
  const posters = Array.isArray(performer.posters) ? performer.posters as ScraperPoster[] : []
  const poster = pickBestPoster(posters)
  if (!poster?.url) return false

  const imagePath = path.join(
    dbPath,
    'meta',
    String(meta.id),
    `${tag.id}_main.jpg`,
  )
  const aspectRatio = Number(meta.imageAspectRatio) || 1
  const sizes = {width: 300, height: 300 / aspectRatio}
  const response = await createImage(poster.url, imagePath, sizes)
  if (response.status !== 201) return false

  if (
    meta.autoColorFromImage
    && meta.color
    && isDefaultTagColor(vals.color)
  ) {
    const color = await extractColorFromLocalFile(imagePath)
    if (!isDefaultTagColor(color)) {
      vals.color = color
    }
  }

  return true
}

export async function autoApplyScrapedTagData({
  tag,
  meta,
  performer,
  dbPath,
  allTags,
}: AutoScrapeApplyParams): Promise<AutoScrapeApplyResult> {
  try {
    const pinnedResponse = await typedApi.getPinnedChildMeta(meta.id)
    const assignedItems = sortPinnedAssignmentItems(pinnedResponse.data)
    const pinned = assignedItems as ScraperPinnedItem[]

    if (!pinned.some((item) => item.scraper)) {
      return {success: false, error: 'no_scraper_fields'}
    }

    const currentValues = await loadTagValues(tag, assignedItems)
    const fields = buildScraperTransferFields({
      selected: {
        name: typeof performer.name === 'string' ? performer.name : null,
        aliases: Array.isArray(performer.aliases) ? performer.aliases as string[] : undefined,
        bio: typeof performer.bio === 'string' ? performer.bio : null,
        extras: (performer.extras as Record<string, unknown> | undefined) || {},
        posters: performer.posters as ScraperPoster[] | undefined,
      },
      pinned,
      currentValues,
      tags: allTags,
    }).map((field) => ({
      ...field,
      isTransfered: true,
    }))

    const vals = {...currentValues}
    const tagsBefore = allTags.length
    await applyTransferFields({fields, vals, allTags})
    const createdTagIds = allTags.slice(tagsBefore).map((entry) => entry.id)

    await downloadMainImage({performer, meta, tag, dbPath, vals})
    await saveTagValues(tag.id, vals, assignedItems)

    return {
      success: true,
      performerName: typeof performer.name === 'string' ? performer.name : undefined,
      createdTagIds,
    }
  } catch (error) {
    console.error('autoApplyScrapedTagData error', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'unknown_error',
    }
  }
}
