import type { Meta, Tag } from '@/types/stores'
import type { SceneScraperScene } from '@/types/sceneScraper'
import type { ScraperPinnedItem, ScraperTransferField } from '@/types/scraper'
import { areScraperValuesEqual } from '@/utils/scraperValueCompare'
import {
  buildScrapedTagEntries,
  findTagByNameOrSynonym,
  normalizeScrapedTagNames,
  tagMatchesLookupName,
} from '@/utils/sceneScraperTags'

function cloneTransferValue(value: unknown): unknown {
  if (Array.isArray(value)) return [...value]
  if (value && typeof value === 'object') return {...value as Record<string, unknown>}
  return value
}

function areAllScrapedNamesPresent(
  assignedTagIds: number[],
  scrapedNames: string[],
  metaId: number,
  tags: Tag[],
): boolean {
  if (!scrapedNames.length) return false
  if (!assignedTagIds.length) return false

  const metaTags = tags.filter((tag) => Number(tag.metaId) === Number(metaId))
  const assignedTags = metaTags.filter((tag) =>
    assignedTagIds.includes(Number(tag.id)),
  )

  return scrapedNames.every((name) =>
    assignedTags.some((tag) => tagMatchesLookupName(tag, name)),
  )
}

function areAnyScrapedTagsPresent(
  scrapedNames: string[],
  metaId: number,
  tags: Tag[],
): boolean {
  const metaTags = tags.filter((tag) => Number(tag.metaId) === Number(metaId))
  return scrapedNames.some((name) =>
    Boolean(findTagByNameOrSynonym(metaId, name, metaTags)),
  )
}

export function getSceneScraperExtras(scene: SceneScraperScene): Record<string, unknown> {
  const performers = (scene.performers || [])
    .map((item) => item.performer?.name)
    .filter((name): name is string => Boolean(name))
  const tags = (scene.tags || [])
    .map((item) => item.name)
    .filter((name): name is string => Boolean(name))

  return {
    title: scene.title || null,
    release_date: scene.date || scene.release_date || null,
    details: scene.details || null,
    studio: scene.studio?.name || null,
    performers,
    tags,
  }
}

export function buildSceneTransferFields({
  scene,
  pinned,
  currentValues,
  tags,
}: {
  scene: SceneScraperScene
  pinned: ScraperPinnedItem[]
  currentValues: Record<string, unknown>
  tags: Tag[]
}): ScraperTransferField[] {
  const values = getSceneScraperExtras(scene)
  const data: ScraperTransferField[] = []
  const metas = pinned.filter((item) => item.scraper)

  if (values.title) {
    const currentName = currentValues.name
    data.push({
      dataType: 'mediaName',
      valueCurrent: cloneTransferValue(currentName),
      valueReserved: cloneTransferValue(currentName),
      valueScraper: values.title,
      isTagExists: false,
      key: 'title',
      meta: { id: 0, icon: 'file-document-outline', name: 'file_name' } satisfies Meta,
      isTransfered: false,
      isAlreadyContain: areScraperValuesEqual(currentName, values.title, 'string'),
    })
  }

  if (values.details) {
    const currentBookmark = currentValues.bookmark
    data.push({
      dataType: 'bookmark',
      valueCurrent: cloneTransferValue(currentBookmark),
      valueReserved: cloneTransferValue(currentBookmark),
      valueScraper: values.details,
      isTagExists: false,
      key: 'details',
      meta: { id: 0, icon: 'bookmark', name: 'bookmark' } satisfies Meta,
      isTransfered: false,
      isAlreadyContain: areScraperValuesEqual(currentBookmark, values.details, 'string'),
    })
  }

  metas.forEach((metaItem) => {
    if (!metaItem.meta) return

    const scraperKey = String(metaItem.scraper)
    const valueScraper = values[scraperKey]
    if (valueScraper == null || valueScraper === '') return
    if (Array.isArray(valueScraper) && valueScraper.length === 0) return

    const pinnedKey = metaItem.pinnedMetaId ?? metaItem.metaId
    const rawAssignedValue = pinnedKey != null ? currentValues[pinnedKey] : null
    let val = rawAssignedValue
    let isTagExists = false
    const scrapedNames = metaItem.meta.type === 'array'
      ? normalizeScrapedTagNames(valueScraper)
      : []
    const assignedTagIds = metaItem.meta.type === 'array' && Array.isArray(rawAssignedValue)
      ? rawAssignedValue
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id))
      : []

    if (metaItem.meta.type === 'array') {
      if (assignedTagIds.length) {
        val = assignedTagIds.map((id) => {
          const tag = tags.find((entry) => Number(entry.id) === id)
          return tag ? tag.name : id
        })
      } else {
        val = []
      }

      isTagExists = areAnyScrapedTagsPresent(scrapedNames, metaItem.meta.id, tags)
    }

    let isAlreadyContain = false
    if (metaItem.meta.type === 'array') {
      isAlreadyContain = areAllScrapedNamesPresent(assignedTagIds, scrapedNames, metaItem.meta.id, tags)
    } else if (Array.isArray(val) && val.length) {
      isAlreadyContain = val.includes(valueScraper)
    } else {
      isAlreadyContain = areScraperValuesEqual(val, valueScraper, metaItem.meta.type)
    }

    data.push({
      dataType: metaItem.meta.type,
      valueCurrent: cloneTransferValue(val),
      valueReserved: cloneTransferValue(val),
      valueScraper,
      isTagExists,
      scrapedTags: metaItem.meta.type === 'array'
        ? buildScrapedTagEntries({
          scrapedNames,
          metaId: metaItem.meta.id,
          assignedTagIds,
          tags,
        })
        : undefined,
      key: scraperKey,
      meta: {...metaItem.meta},
      isTransfered: false,
      isAlreadyContain,
    })
  })

  return data
}
