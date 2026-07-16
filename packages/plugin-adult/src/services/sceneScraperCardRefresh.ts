import { useAppStore } from '@/stores/app'
import { useItemsStore } from '@/stores/items'
import { typedApi } from '@/services/typedApi'
import { invalidateVideoThumbCaches } from '@/utils/thumbDisplayCache'
import type { SceneAutoApplyResult } from './sceneScraperAutoApply'

export async function reloadAppTags() {
  const appStore = useAppStore()
  const res = await typedApi.getTags()
  appStore.tags = res.data.map((tag) => ({
    ...tag,
    metaId: tag.metaId ?? undefined,
    name: tag.name ?? undefined,
    synonyms: tag.synonyms ?? undefined,
    color: tag.color ?? undefined,
    bookmark: tag.bookmark ?? undefined,
  }))
}

/**
 * Apply scraped relations to the media card.
 * Always reload app tags first so newly created performers/tags resolve in chips.
 */
export async function applySceneScrapeResultToCard(
  mediaId: number,
  result?: Pick<SceneAutoApplyResult, 'mediaName' | 'mediaBookmark' | 'mediaTags' | 'mediaValues'>,
  {
    refreshThumb = true,
  }: {
    refreshThumb?: boolean
  } = {},
) {
  const itemsStore = useItemsStore()

  await reloadAppTags()

  itemsStore.updateItem({
    id: mediaId,
    item: {
      ...(result?.mediaName !== undefined ? {name: result.mediaName || undefined} : {}),
      ...(result?.mediaBookmark !== undefined ? {bookmark: result.mediaBookmark ?? undefined} : {}),
      tags: [...(result?.mediaTags || [])],
      values: [...(result?.mediaValues || [])],
    },
  })

  if (refreshThumb) {
    // Cache-bust only. Never pass regenerate:true — that enables ffmpeg recreate on a
    // failed existence probe and can overwrite a scraped poster with a video frame.
    invalidateVideoThumbCaches(mediaId)
    itemsStore.refreshThumb(mediaId)
  }
}
