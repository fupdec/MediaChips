import path from 'path-browserify'
import {typedApi} from '@/services/typedApi'
import {createImage} from '@/services/fileService'
import {useAppStore} from '@/stores/app'
import {useSettingsStore} from '@/stores/settings'
import {useItemsStore} from '@/stores/items'
import {reloadTagsCatalog} from '@/composable/appCatalogs'
import {refreshTagThumbDisplay} from '@/utils/tagThumbRefresh'
import {TAG_IMAGE_SAVE_WIDTH} from '@shared/tagImages'
import {autoApplyScrapedTagData} from './scraperAutoApply'
import {findOrCreateTagByName, findTagByNameOrSynonym} from '../utils/sceneScraperTags'
import {getOrderedScraperPosters} from '../utils/scraperPosters'
import type {CamGirlFinderMappedPerformer} from '../types/camgirlfinder'
import type {Meta, Tag} from '@/types/stores'
import type {ScraperPerformer, ScraperPoster} from '../types/scraper'

export interface ApplyCamGirlFinderParams {
  performer: CamGirlFinderMappedPerformer
  meta?: Meta | null
  tag?: Tag | null
  faceIds?: number[]
  imageUrls?: string[]
  dbPath: string
}

export interface ApplyCamGirlFinderResult {
  success: boolean
  createdTag: boolean
  tag?: Tag
  meta?: Meta
  performerName?: string
  error?: string
}

function resolvePerformerMeta(preferred?: Meta | null): Meta | null {
  if (preferred?.id) return preferred

  const appStore = useAppStore()
  const settingsStore = useSettingsStore()
  const configured = Number(settingsStore['faceMatch.performerMetaId'] || 0)
  if (configured) {
    const byId = (appStore.meta || []).find((meta) => Number(meta.id) === configured)
    if (byId) return byId
  }

  return (appStore.meta || []).find((meta) => meta.type === 'array' && Boolean(meta.scraper)) || null
}

function formatAliases(aliases: unknown, performerName?: string | null): string | null {
  if (!Array.isArray(aliases)) return null
  const names = aliases
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean)
    .filter((name) => !performerName || name.toLowerCase() !== performerName.toLowerCase())
  if (!names.length) return null
  return names.join(', ')
}

function mergeSynonyms(current: unknown, scraped: string): string {
  const existing = String(current || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  const next = scraped
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  return [...new Set([...existing, ...next])].join(', ')
}

function mergeBookmark(current: unknown, scraped: string): string {
  const currentText = String(current || '').trim()
  const scrapedText = scraped.trim()
  if (!scrapedText) return currentText
  if (!currentText) return scrapedText
  if (currentText.includes(scrapedText)) return currentText
  return `${currentText}\n\n${scrapedText}`
}

async function applyCoreTagFields({
  tag,
  meta,
  performer,
  dbPath,
  imageUrls,
}: {
  tag: Tag
  meta: Meta
  performer: CamGirlFinderMappedPerformer
  dbPath: string
  imageUrls?: string[]
}) {
  const name = String(performer.name || tag.name || '').trim()
  const aliases = formatAliases(performer.aliases, name)
  const bio = String(performer.bio || '').trim()

  const payload: Record<string, unknown> = {}
  if (name && name !== tag.name) payload.name = name
  if (aliases) payload.synonyms = mergeSynonyms(tag.synonyms, aliases)
  if (bio) payload.bookmark = mergeBookmark(tag.bookmark, bio)

  if (Object.keys(payload).length) {
    await typedApi.updateEntity('tag', tag.id, payload)
    Object.assign(tag, payload)
  }

  const preferredUrls = (imageUrls || [])
    .map((url) => String(url || '').trim())
    .filter(Boolean)
  const posters = preferredUrls.length
    ? preferredUrls.map((url, index) => ({id: index, url, size: 0}))
    : getOrderedScraperPosters(
      Array.isArray(performer.posters) ? performer.posters as ScraperPoster[] : [],
    )
  if (!posters.length || !dbPath) return

  const imageTypes = ['main', 'alt', 'custom1', 'custom2'] as const
  const aspectRatio = Number(meta.imageAspectRatio) || 1
  const sizes = {width: TAG_IMAGE_SAVE_WIDTH, height: TAG_IMAGE_SAVE_WIDTH / aspectRatio}

  for (let index = 0; index < Math.min(posters.length, imageTypes.length); index++) {
    const imagePath = path.join(
      dbPath,
      'meta',
      String(meta.id),
      `${tag.id}_${imageTypes[index]}.jpg`,
    )
    await createImage(posters[index].url, imagePath, sizes)
  }
}

async function assignFacesToTag(faceIds: number[], tagId: number) {
  const ids = [...new Set(faceIds.map(Number).filter((id) => Number.isFinite(id) && id > 0))]
  for (let index = 0; index < ids.length; index++) {
    await typedApi.assignFacePerformer({
      faceId: ids[index],
      tagId,
      enroll: index === 0,
      applyTag: index === 0,
    })
  }
}

export async function applyCamGirlFinderPerformer({
  performer,
  meta: preferredMeta,
  tag: preferredTag,
  faceIds = [],
  imageUrls = [],
  dbPath,
}: ApplyCamGirlFinderParams): Promise<ApplyCamGirlFinderResult> {
  const meta = resolvePerformerMeta(preferredMeta)
  if (!meta?.id) {
    return {success: false, createdTag: false, error: 'no_performer_meta'}
  }

  const name = String(performer.name || '').trim()
  if (!name) {
    return {success: false, createdTag: false, error: 'missing_name'}
  }

  const appStore = useAppStore()
  const itemsStore = useItemsStore()
  const workingTags = [...(appStore.tags || [])]
  let createdTag = false
  let tag = preferredTag?.id ? {...preferredTag} : null
  const selectedImageUrls = imageUrls
    .map((url) => String(url || '').trim())
    .filter(Boolean)

  try {
    if (!tag?.id) {
      const existed = findTagByNameOrSynonym(meta.id, name, workingTags)
      const tagId = await findOrCreateTagByName(
        name,
        meta.id,
        workingTags,
        (payload) => typedApi.createTags(payload),
      )
      createdTag = !existed
      await reloadTagsCatalog()
      tag = (appStore.tags || []).find((entry) => Number(entry.id) === Number(tagId))
        || workingTags.find((entry) => Number(entry.id) === Number(tagId))
        || {id: tagId, name, metaId: meta.id} as Tag
    }

    if (!tag?.id) {
      return {success: false, createdTag: false, error: 'tag_create_failed'}
    }

    const performerForApply = selectedImageUrls.length
      ? {
          ...performer,
          posters: selectedImageUrls.map((url, index) => ({id: index, url, size: 0})),
        }
      : performer

    const scrapeResult = await autoApplyScrapedTagData({
      tag,
      meta,
      performer: performerForApply as unknown as ScraperPerformer,
      dbPath,
      allTags: appStore.tags || [],
    })

    if (!scrapeResult.success) {
      await applyCoreTagFields({
        tag,
        meta,
        performer: performerForApply,
        dbPath,
        imageUrls: selectedImageUrls,
      })
      if (scrapeResult.error && scrapeResult.error !== 'no_scraper_fields') {
        return {
          success: false,
          createdTag,
          tag,
          meta,
          error: scrapeResult.error,
        }
      }
    } else if (selectedImageUrls.length) {
      // autoApply may have used posters[0]; ensure selected images are written.
      await applyCoreTagFields({
        tag,
        meta,
        performer: performerForApply,
        dbPath,
        imageUrls: selectedImageUrls,
      })
    }

    if (faceIds.length) {
      await assignFacesToTag(faceIds, tag.id)
    }

    refreshTagThumbDisplay(itemsStore, dbPath, meta.id, tag.id)

    return {
      success: true,
      createdTag,
      tag,
      meta,
      performerName: scrapeResult.performerName || name,
    }
  } catch (error) {
    console.error('applyCamGirlFinderPerformer error', error)
    return {
      success: false,
      createdTag,
      error: error instanceof Error ? error.message : 'unknown_error',
    }
  }
}
