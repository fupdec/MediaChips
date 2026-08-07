import {readonly, ref} from 'vue'
import type {MediaItem} from '@/types/stores'
import {typedApi} from '@/services/typedApi'
import {setNotification} from '@/services/notificationService'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {usePlayerStore} from '@/stores/player'
import {isVideoMediaType} from '@/utils/mediaType'
import {i18n} from '@/i18n/loadLocale'

export const SIMILAR_RADIO_FETCH_LIMIT = 24
export const SIMILAR_RADIO_KEEP_LIMIT = 16
export const SIMILAR_RADIO_REFILL_REMAINING = 2

const active = ref(false)
const seenIds = new Set<number>()
let inFlight = false
let suppressStopOnNextPlay = false

export const similarRadioActive = readonly(active)

export function isSimilarRadioActive(): boolean {
  return active.value
}

/** Pure: drop excluded ids, keep order, optional cap. */
export function filterUnseenNeighborIds(options: {
  neighborIds: Array<number | string | null | undefined>
  excludeIds: Iterable<number>
  limit?: number
}): number[] {
  const exclude = new Set(
    [...options.excludeIds].map(Number).filter((id) => Number.isFinite(id) && id > 0),
  )
  const out: number[] = []
  const seen = new Set<number>()
  const limit = options.limit ?? SIMILAR_RADIO_KEEP_LIMIT
  for (const raw of options.neighborIds) {
    const id = Number(raw)
    if (!Number.isFinite(id) || id <= 0 || exclude.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= limit) break
  }
  return out
}

export function shouldRefillSimilarRadio(options: {
  playlistLength: number
  nowPlaying: number
  remainingThreshold?: number
}): boolean {
  const length = Math.max(0, Number(options.playlistLength) || 0)
  const now = Math.max(0, Number(options.nowPlaying) || 0)
  const threshold = options.remainingThreshold ?? SIMILAR_RADIO_REFILL_REMAINING
  if (length <= 0) return false
  return length - now <= threshold
}

function t(key: string, params?: Record<string, unknown>): string {
  return String(params ? i18n.global.t(key, params) : i18n.global.t(key))
}

function notify(type: 'success' | 'info' | 'error' | 'warning', textKey: string, params?: Record<string, unknown>) {
  setNotification({
    type,
    title: t('player.similar_radio'),
    text: t(textKey, params),
    icon: 'radio-tower',
  })
}

function markSeen(ids: Iterable<number>) {
  for (const id of ids) {
    const n = Number(id)
    if (Number.isFinite(n) && n > 0) seenIds.add(n)
  }
}

function forceRadioPlaylistMode() {
  const playerStore = usePlayerStore()
  playerStore.playlistMode = ['autoplay']
}

export function stopSimilarRadio(options: {silent?: boolean} = {}): void {
  const wasActive = active.value
  active.value = false
  seenIds.clear()
  inFlight = false
  if (wasActive && !options.silent) {
    notify('info', 'player.similar_radio_stopped')
  }
}

/** Call from unrelated playVideo / player close so radio does not stick. */
export function noteExternalPlayVideo(): void {
  if (suppressStopOnNextPlay) return
  if (active.value) stopSimilarRadio({silent: true})
}

async function hydrateVideosByIds(ids: number[]): Promise<MediaItem[]> {
  if (!ids.length) return []
  const appStore = useAppStore()
  const basicsRes = await typedApi.getMediaBasics({ids})
  const byId = new Map<number, MediaItem>()
  for (const item of Array.isArray(basicsRes.data?.items) ? basicsRes.data.items : []) {
    const id = Number(item?.id)
    if (!Number.isFinite(id) || id <= 0) continue
    byId.set(id, item as MediaItem)
  }

  return ids
    .map((id) => {
      const item = byId.get(id)
      if (!item?.path) return null
      const type = appStore.mediaTypes?.find((entry) => entry.id === Number(item.mediaTypeId))
      if (type && !isVideoMediaType(type)) return null
      return item
    })
    .filter((item): item is MediaItem => Boolean(item))
}

async function fetchNeighborIds(seedId: number): Promise<{
  hasEmbedding: boolean
  ids: number[]
}> {
  const response = await typedApi.similarByClip({
    seedId,
    limit: SIMILAR_RADIO_FETCH_LIMIT,
  })
  const data = response.data
  const hasEmbedding = Boolean(data?.hasEmbedding)
  const ids = Array.isArray(data?.ids)
    ? data.ids.map(Number).filter((id) => Number.isFinite(id) && id > 0)
    : []
  return {hasEmbedding, ids}
}

function applyPlaylist(videos: MediaItem[]) {
  const appStore = useAppStore()
  const playerStore = usePlayerStore()
  playerStore.setPlaylistItems(videos, {host: appStore.localhost || ''})
}

export type StartSimilarRadioOptions = {
  /** Prefetched neighbor ids (e.g. similar wall). Seed may be included; it is filtered out. */
  initialNeighborIds?: number[]
}

export async function startSimilarRadio(
  seed: MediaItem,
  options: StartSimilarRadioOptions = {},
): Promise<boolean> {
  const seedId = Number(seed?.id)
  if (!Number.isFinite(seedId) || seedId <= 0 || !seed?.path) {
    notify('error', 'player.similar_radio_failed')
    return false
  }

  suppressStopOnNextPlay = true
  stopSimilarRadio({silent: true})
  active.value = true
  markSeen([seedId])
  forceRadioPlaylistMode()

  const itemsStore = useItemsStore()
  try {
    let neighborIds: number[]
    if (options.initialNeighborIds?.length) {
      neighborIds = filterUnseenNeighborIds({
        neighborIds: options.initialNeighborIds,
        excludeIds: seenIds,
        limit: SIMILAR_RADIO_KEEP_LIMIT,
      })
    } else {
      const {hasEmbedding, ids} = await fetchNeighborIds(seedId)
      if (!hasEmbedding) {
        notify('warning', 'context_menu.semantically_similar_no_embedding')
        stopSimilarRadio({silent: true})
        return false
      }
      neighborIds = filterUnseenNeighborIds({
        neighborIds: ids,
        excludeIds: seenIds,
        limit: SIMILAR_RADIO_KEEP_LIMIT,
      })
    }

    const neighbors = await hydrateVideosByIds(neighborIds)
    if (!neighbors.length) {
      notify('info', 'player.similar_radio_empty')
      stopSimilarRadio({silent: true})
      return false
    }

    const played = await itemsStore.playVideo({
      video: seed,
      videos: [seed],
      trustPath: true,
      player: 'builtin',
    })
    if (!played) {
      stopSimilarRadio({silent: true})
      return false
    }

    markSeen(neighbors.map((item) => Number(item.id)))
    forceRadioPlaylistMode()
    applyPlaylist([seed, ...neighbors])
    notify('success', 'player.similar_radio_started', {count: neighbors.length + 1})
    return true
  } catch (error) {
    console.error('Similar radio start failed:', error)
    notify('error', 'player.similar_radio_failed')
    stopSimilarRadio({silent: true})
    return false
  } finally {
    suppressStopOnNextPlay = false
  }
}

export async function refillSimilarRadio(): Promise<void> {
  if (!active.value || inFlight) return

  const playerStore = usePlayerStore()
  const current = playerStore.playlist[playerStore.nowPlaying]
  const seedId = Number(current?.id)
  if (!Number.isFinite(seedId) || seedId <= 0) return

  inFlight = true
  try {
    forceRadioPlaylistMode()

    const playlistIds = playerStore.playlist
      .map((item) => Number(item.id))
      .filter((id) => Number.isFinite(id) && id > 0)

    const {hasEmbedding, ids} = await fetchNeighborIds(seedId)
    if (!active.value) return

    if (!hasEmbedding) {
      notify('warning', 'context_menu.semantically_similar_no_embedding')
      stopSimilarRadio({silent: true})
      return
    }

    const freshIds = filterUnseenNeighborIds({
      neighborIds: ids,
      excludeIds: [...seenIds, ...playlistIds, seedId],
      limit: SIMILAR_RADIO_KEEP_LIMIT,
    })
    const fresh = await hydrateVideosByIds(freshIds)
    if (!active.value) return

    if (!fresh.length) {
      notify('info', 'player.similar_radio_empty')
      stopSimilarRadio({silent: true})
      return
    }

    markSeen(fresh.map((item) => Number(item.id)))
    applyPlaylist([...playerStore.playlist, ...fresh])
  } catch (error) {
    console.error('Similar radio refill failed:', error)
    // Keep radio active; next advance can retry.
  } finally {
    inFlight = false
  }
}

/** Fire-and-forget refill when near end of playlist. */
export function maybeRefillSimilarRadio(): void {
  if (!active.value) return
  const playerStore = usePlayerStore()
  if (!shouldRefillSimilarRadio({
    playlistLength: playerStore.playlist.length,
    nowPlaying: playerStore.nowPlaying,
  })) return
  void refillSimilarRadio()
}
