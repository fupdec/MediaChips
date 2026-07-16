import {typedApi} from '@/services/typedApi'
import {useDialogsStore} from '@/stores/dialogs'
import {useItemsStore} from '@/stores/items'
import type {MediaItem} from '@/types/stores'

const MEDIA_FILE_INFO_FIELDS = [
  'filesize',
  'duration',
  'width',
  'height',
  'ext',
  'codec',
  'bitrate',
  'fps',
  'orientation',
  'path',
  'basename',
  'name',
] as const

type MediaFileInfoField = (typeof MEDIA_FILE_INFO_FIELDS)[number]

const inFlight = new Map<number, Promise<Partial<MediaItem> | null>>()

export function pickMediaFileInfo(item: Partial<MediaItem>): Partial<MediaItem> {
  const picked: Partial<MediaItem> = {}
  for (const key of MEDIA_FILE_INFO_FIELDS) {
    if (item[key] !== undefined) {
      picked[key] = item[key as MediaFileInfoField]
    }
  }
  return picked
}

export function syncMediaFileInfo(mediaId: number, fileInfo: Partial<MediaItem>) {
  const itemsStore = useItemsStore()
  const dialogsStore = useDialogsStore()

  itemsStore.updateItem({id: mediaId, item: fileInfo})

  const editingMedia = dialogsStore.mediaEditing.media
  if (dialogsStore.mediaEditing.show && editingMedia && Number(editingMedia.id) === Number(mediaId)) {
    dialogsStore.mediaEditing.media = {...editingMedia, ...fileInfo}
  }
}

async function loadRefreshedMediaFileInfo(mediaId: number): Promise<Partial<MediaItem> | null> {
  await typedApi.updateMediaInfo(mediaId)

  const res = await typedApi.getMediaItems({
    ids: [mediaId],
    skipTotals: true,
    includeNavigation: false,
  })

  const item = res.data.items?.find((entry) => Number(entry.id) === Number(mediaId))
  if (!item) return null

  const fileInfo = pickMediaFileInfo(item)
  syncMediaFileInfo(mediaId, fileInfo)
  return fileInfo
}

/**
 * Re-probe file metadata (size, duration, resolution, codec, …)
 * and sync the result into the items list + open editing dialog.
 */
export async function refreshMediaFileInfo(mediaId: number): Promise<Partial<MediaItem> | null> {
  const id = Number(mediaId)
  if (!id) return null

  const existing = inFlight.get(id)
  if (existing) return existing

  const promise = loadRefreshedMediaFileInfo(id)
    .catch((error) => {
      console.error('Failed to refresh media file info:', error)
      return null
    })
    .finally(() => {
      inFlight.delete(id)
    })

  inFlight.set(id, promise)
  return promise
}
