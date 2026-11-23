import {useAppStore} from '@/stores/app'
import {getApiBaseUrl} from '@/services/apiClient'
import {typedApi} from '@/services/typedApi'
import {useDialogsStore} from '@/stores/dialogs'
import {useItemsStore} from '@/stores/items'
import type {MediaItem} from '@/types/stores'
import {mapWithConcurrency} from '@/utils/mapWithConcurrency'

/** Parallel refresh of selection metadata without flooding the API. */
export const MEDIA_FILE_INFO_REFRESH_CONCURRENCY = 4

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

const inFlightByStore = new WeakMap<object, Map<string, Promise<Partial<MediaItem> | null>>>()

function refreshContext() {
  const app = useAppStore()
  const key = () => JSON.stringify([app.dbPath, getApiBaseUrl(app)])
  const expected = key()
  return {app, key: expected, isCurrent: () => key() === expected}
}

export function pickMediaFileInfo(item: Partial<MediaItem>): Partial<MediaItem> {
  const picked: Partial<MediaItem> = {}
  for (const key of MEDIA_FILE_INFO_FIELDS) {
    const value = item[key as MediaFileInfoField]
    if (value !== undefined) {
      Object.assign(picked, {[key]: value})
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

async function loadRefreshedMediaFileInfo(mediaId: number, context: ReturnType<typeof refreshContext>): Promise<Partial<MediaItem> | null> {
  await typedApi.updateMediaInfo(mediaId)
  if (!context.isCurrent()) return null

  const res = await typedApi.getMediaItems({
    ids: [mediaId],
    skipTotals: true,
    includeNavigation: false,
  })

  if (!context.isCurrent()) return null
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
  if (!Number.isSafeInteger(id) || id <= 0) return null

  const context = refreshContext()
  let inFlight = inFlightByStore.get(context.app)
  if (!inFlight) {
    inFlight = new Map()
    inFlightByStore.set(context.app, inFlight)
  }
  const key = JSON.stringify([context.key, id])
  const requests = inFlight
  const existing = requests.get(key)
  if (existing) return existing

  const promise = loadRefreshedMediaFileInfo(id, context)
    .catch((error) => {
      console.error('Failed to refresh media file info:', error)
      return null
    })
    .finally(() => {
      requests.delete(key)
    })

  requests.set(key, promise)
  return promise
}

/** Refresh many media ids with bounded concurrency; returns successfully updated ids. */
export async function refreshMediaFileInfoMany(
  mediaIds: number[],
  concurrency: number = MEDIA_FILE_INFO_REFRESH_CONCURRENCY,
): Promise<number[]> {
  const ids = [...new Set(mediaIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))]
  if (!ids.length) return []

  const context = refreshContext()
  const results = await mapWithConcurrency(ids, concurrency, async (id) => {
    if (!context.isCurrent()) return null
    const fileInfo = await refreshMediaFileInfo(id)
    return fileInfo ? id : null
  })

  return results.filter((id): id is number => id != null)
}
