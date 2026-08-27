import {typedApi} from '@/services/typedApi'
import {useItemsListSync} from '@/composable/itemsListSync'
import {useItemsStore} from '@/stores/items'
import type {MediaTagDragPayload} from '@/utils/mediaTagDrag'

export type MediaTagTransferMode = 'copy' | 'move'

export type MediaTagTransferResult =
  | {ok: true; mode: MediaTagTransferMode; alreadyHad: boolean}
  | {ok: false; reason: 'same_card' | 'already_had' | 'failed'}

function mediaHasTag(mediaId: number, tagId: number): boolean {
  const itemsStore = useItemsStore()
  const item = itemsStore.getItemById(mediaId)
    ?? itemsStore.itemsOnPage.find((entry) => Number(entry.id) === mediaId)
    ?? itemsStore.entities.find((entry) => Number(entry.id) === mediaId)
  if (!item?.tags) return false
  return item.tags.some((entry) => Number(entry.tagId) === tagId)
}

/**
 * Copy (default) or move (Shift) a tag from one media card onto another.
 * Safe to call from card drop handlers outside setup when stores are already active.
 */
export function useMediaTagTransfer() {
  const listSync = useItemsListSync()
  const itemsStore = useItemsStore()

  async function transferTagToMedia(
    payload: MediaTagDragPayload,
    targetMediaId: number,
    mode: MediaTagTransferMode,
  ): Promise<MediaTagTransferResult> {
    const targetId = Number(targetMediaId)
    const sourceId = Number(payload.sourceMediaId)
    const tagId = Number(payload.tagId)
    const metaId = Number(payload.metaId)

    if (!Number.isFinite(targetId) || targetId <= 0) {
      return {ok: false, reason: 'failed'}
    }
    if (sourceId > 0 && targetId === sourceId) {
      return {ok: false, reason: 'same_card'}
    }
    if (mediaHasTag(targetId, tagId)) {
      return {ok: false, reason: 'already_had'}
    }

    try {
      await typedApi.createTagsInMediaOne({
        mediaId: targetId,
        tagId,
        metaId,
      })

      if (mode === 'move' && sourceId > 0) {
        await typedApi.removeTagFromItem('media', {
          mediaId: sourceId,
          tagId,
        })
        itemsStore.removeTagFromItem({itemId: sourceId, tagId})
      }

      const ids = mode === 'move' && sourceId > 0 ? [targetId, sourceId] : [targetId]
      listSync.getItemsFromDb({ids, type: 'media'})

      return {ok: true, mode, alreadyHad: false}
    } catch (error) {
      console.error(error)
      return {ok: false, reason: 'failed'}
    }
  }

  return {transferTagToMedia}
}
