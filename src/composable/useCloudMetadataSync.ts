import {isNasMediaPath} from '@shared/remoteMedia'
import {buildLocalFileUrl} from '@/services/fileService'
import path from 'path-browserify'
import {computed, onScopeDispose, watch, type Ref} from 'vue'
import {parseCloudMediaPath} from '@shared/cloudAccounts'
import {isDriveMediaPath} from '@shared/cloudDrive'
import {typedApi} from '@/services/typedApi'
import {getApiBaseUrl} from '@/services/apiClient'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useDialogsStore} from '@/stores/dialogs'
import {getLoadedHomeMedia} from '@/composable/useHomeMedia'
import type {MediaItem} from '@/types/stores'

export const CLOUD_METADATA_SYNC_MS = 5000
const BATCH_SIZE = 64
const numericFields = ['filesize', 'duration', 'width', 'height', 'bitrate', 'fps'] as const
const textFields = ['codec', 'title', 'artist', 'album'] as const
const metadataFields = [...numericFields, ...textFields] as const
const positive = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0

function needsMetadata(item: MediaItem, kind: string): boolean {
  if (!Number.isSafeInteger(Number(item.id)) || Number(item.id) <= 0 || !['video', 'audio', 'image'].includes(kind)) return false
  const cloud = parseCloudMediaPath(item.path)
  const nas = isNasMediaPath(item.path)
  if (!cloud && !isDriveMediaPath(item.path) && !nas) return false
  if (nas && item.thumbnailState !== 'ready' && item.thumbnailState !== 'unavailable') return true
  if (!positive(item.filesize)) return true
  if (kind === 'image') return !positive(item.width) || !positive(item.height)
  if (kind === 'video' && (!positive(item.duration) || !positive(item.width) || !positive(item.height))) return true
  if ((cloud?.provider === 'onedrive' || nas) && ['video', 'audio'].includes(kind)) {
    return !positive(item.duration) || !positive(item.bitrate)
      || (kind === 'video' && (!positive(item.fps) || !String(item.codec || '').trim()))
  }
  return false
}

/** Read persisted metadata only; cloud probing belongs to the server worker. */
export function useCloudMetadataSync(enabled: Ref<boolean>) {
  const app = useAppStore(), items = useItemsStore(), dialogs = useDialogsStore()
  let generation = 0, cursor = 0
  const thumbVersions = new Map<number, number>()
  let timer: ReturnType<typeof setInterval> | undefined
  let controller: AbortController | undefined
  const context = computed(() => `${app.dbPath}\n${getApiBaseUrl(app)}`)
  const cards = (): MediaItem[] => [
    ...items.itemsOnPage, ...items.entities, ...getLoadedHomeMedia(),
    ...(dialogs.mediaEditing.show && dialogs.mediaEditing.media ? [dialogs.mediaEditing.media] : []),
  ] as MediaItem[]
  const targets = () => [...cards(), ...items.navigationItems]

  const tick = async () => {
    if (!enabled.value || !app.dbPath || controller || document.visibilityState === 'hidden') return
    const candidates = cards().filter(item => needsMetadata(item,
      app.mediaTypes.find(type => Number(type.id) === Number(item.mediaTypeId))?.type || '',
    ))
    const unique = [...new Map(candidates.map(item => [item.id, item])).values()]
    if (!unique.length) { cursor = 0; return }
    if (cursor >= unique.length) cursor = 0
    const batch = unique.slice(cursor, cursor + BATCH_SIZE)
    cursor = (cursor + BATCH_SIZE) % unique.length
    const paths = new Map(batch.map(item => [Number(item.id), item.path]))
    const originalValues = new Map(targets().filter(item => paths.get(Number(item.id)) === item.path)
      .map(item => [item, Object.fromEntries(metadataFields.map(field => [field, item[field]]))]))
    const expectedGeneration = generation, request = new AbortController()
    controller = request
    try {
      const response = await typedApi.getCloudMediaMetadata(batch.map(item => Number(item.id)), {signal: request.signal, timeout: 15_000})
      if (expectedGeneration !== generation || request.signal.aborted || !enabled.value) return
      const rows = new Map((response.data.items || []).map(item => [Number(item.id), item]))
      for (const target of targets()) {
        const row = rows.get(Number(target.id)), before = originalValues.get(target)
        if (!row || !before || !row.path || row.path !== target.path || paths.get(Number(target.id)) !== row.path) continue
        if (isNasMediaPath(target.path)) {
          if (row.thumbnailState) target.thumbnailState = row.thumbnailState
          if (row.thumbnailVersion && thumbVersions.get(target.id) !== row.thumbnailVersion) {
            thumbVersions.set(target.id, row.thumbnailVersion)
            items.refreshThumb(target.id, {broadcast: false})
          }
          if (row.thumbnailVersion) {
            const kind = app.mediaTypes.find(type => Number(type.id) === Number(target.mediaTypeId))?.type || 'video'
            const folder = kind === 'image' ? 'images' : kind === 'audio' ? 'audios' : 'videos'
            target.thumb = buildLocalFileUrl(path.join(app.mediaPath, folder, 'thumbs', `${target.id}.jpg`), false, row.thumbnailVersion, {maxEdge: 640})
          }
        }
        for (const field of metadataFields) {
          const value = row[field]
          // Only background-filled gaps are applied. Edits made during the request win.
          if (!Object.is(target[field], before[field])) continue
          if ((numericFields as readonly string[]).includes(field)) {
            if (!positive(target[field]) && positive(value)) Object.assign(target, {[field]: value})
          } else if (!String(target[field] || '').trim() && typeof value === 'string' && value.trim()) {
            Object.assign(target, {[field]: value})
          }
        }
      }
    } catch { /* A reconnect or failed snapshot keeps the existing cards intact. */ }
    finally { if (controller === request) controller = undefined }
  }

  const reset = () => {
    generation++; cursor = 0; thumbVersions.clear()
    controller?.abort(); controller = undefined
    clearInterval(timer); timer = undefined
    if (!enabled.value || !app.dbPath) return
    timer = setInterval(() => { void tick() }, CLOUD_METADATA_SYNC_MS)
  }
  const stop = watch([enabled, context], reset, {immediate: true, flush: 'sync'})
  onScopeDispose(() => {
    stop(); generation++
    clearInterval(timer); controller?.abort(); controller = undefined
  })
}
