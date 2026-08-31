import { typedApi } from '@/services/typedApi'
import {
  pickMediaFileInfo,
  syncMediaFileInfo,
  refreshMediaFileInfo,
} from '@/services/mediaFileInfoService'
import { useItemsStore } from '@/stores/items'
import { enqueueImageThumbRegen } from '@/utils/imageThumbRegen'
import {
  invalidateCachedThumb,
  mediaThumbKey,
} from '@/utils/thumbDisplayCache'

/**
 * Quiet on-demand backfill after fast/lite import.
 * Metadata is batched into one HTTP call; image thumbs stay per-card/on-demand.
 */

/** Debounce window so scroll prefetch coalesces ids into one bulk request. */
const META_BATCH_WAIT_MS = 40
/** Soft cap per flush (server max is 64). */
const META_BATCH_MAX = 32

const metaSettled = new Set<number>()
const thumbSettled = new Set<number>()
const metaPending = new Map<number, Array<(ok: boolean) => void>>()
let metaFlushTimer: ReturnType<typeof setTimeout> | null = null
let metaFlushChain: Promise<void> = Promise.resolve()

export function needsQuietMetaBackfill(item: {
  width?: unknown
  height?: unknown
  filesize?: unknown
} | null | undefined): boolean {
  if (!item) return false
  // 0-byte stubs can never yield dims/thumbs — skip the API storm.
  if (Number(item.filesize) === 0) return false
  return (Number(item.width) || 0) <= 0 || (Number(item.height) || 0) <= 0
}

/** True when the source file is known empty / unreadable for previews. */
export function isEmptyMediaSource(item: {filesize?: unknown} | null | undefined): boolean {
  return item != null && Number(item.filesize) === 0
}

/** @deprecated Prefer needsQuietMetaBackfill — same rule for images. */
export const needsQuietImageBackfill = needsQuietMetaBackfill

/** @deprecated Prefer needsQuietMetaBackfill — same rule for videos. */
export const needsQuietVideoMetaBackfill = needsQuietMetaBackfill

async function runImageThumbAndMeta(mediaId: number): Promise<boolean> {
  const fileInfo = await refreshMediaFileInfo(mediaId)
  invalidateCachedThumb(mediaThumbKey('images', mediaId))
  invalidateCachedThumb(mediaThumbKey('images-filmstrip', mediaId))

  const hasDims = (Number(fileInfo?.width) || 0) > 0 && (Number(fileInfo?.height) || 0) > 0
  if (!hasDims) {
    // Empty/corrupt sources still return a row — do not bump thumbRefreshKeys
    // (that resets card regen guards and causes an infinite updateMediaInfo loop).
    return false
  }

  useItemsStore().refreshThumb(mediaId, {broadcast: false})
  return true
}

/**
 * Explicit missing-thumb path (grid cards / viewer): coalesce per id.
 * Settles after one attempt so empty/corrupt files are not retried forever.
 */
export function enqueueImageThumbAndMeta(mediaId: number): Promise<boolean> {
  const id = Number(mediaId)
  if (!id) return Promise.resolve(false)
  if (thumbSettled.has(id)) return Promise.resolve(false)

  return enqueueImageThumbRegen(id, async () => {
    const ok = await runImageThumbAndMeta(id)
    if (!ok) throw new Error(`thumb meta backfill failed for ${id}`)
  })
    .then(() => {
      thumbSettled.add(id)
      return true
    })
    .catch(() => {
      thumbSettled.add(id)
      return false
    })
}

function scheduleMetaFlush(): void {
  if (metaFlushTimer != null) return
  metaFlushTimer = setTimeout(() => {
    metaFlushTimer = null
    metaFlushChain = metaFlushChain.then(() => flushMetaBatch()).catch(() => undefined)
  }, META_BATCH_WAIT_MS)
}

async function flushMetaBatch(): Promise<void> {
  while (metaPending.size) {
    const ids = [...metaPending.keys()].slice(0, META_BATCH_MAX)
    const waiters = new Map<number, Array<(ok: boolean) => void>>()
    for (const id of ids) {
      waiters.set(id, metaPending.get(id) || [])
      metaPending.delete(id)
    }

    let items: Array<{
      id: number
      width?: number
      height?: number
      duration?: number
      filesize?: number
      codec?: string | null
      bitrate?: number | null
      fps?: number | null
      orientation?: number
    }> = []

    try {
      const res = await typedApi.ensureMediaMetadataBulk(ids)
      items = Array.isArray(res.data?.items) ? res.data.items : []
    } catch (error) {
      console.error('Quiet media metadata bulk failed:', error)
      for (const id of ids) {
        metaSettled.add(id)
        for (const resolve of waiters.get(id) || []) resolve(false)
      }
      continue
    }

    const byId = new Map(items.map((item) => [Number(item.id), item]))
    for (const id of ids) {
      metaSettled.add(id)
      const item = byId.get(id)
      if (!item) {
        for (const resolve of waiters.get(id) || []) resolve(false)
        continue
      }

      const fileInfo = pickMediaFileInfo(item)
      syncMediaFileInfo(id, fileInfo)
      for (const resolve of waiters.get(id) || []) resolve(true)
    }
  }
}

/**
 * Quiet metadata-only backfill when width/height are missing.
 * Coalesces many ids into one `/ensureMediaMetadataBulk` call.
 */
export function enqueueQuietMetaBackfill(mediaId: number): Promise<boolean> {
  const id = Number(mediaId)
  if (!id) return Promise.resolve(false)
  if (metaSettled.has(id)) return Promise.resolve(false)

  return new Promise<boolean>((resolve) => {
    const list = metaPending.get(id)
    if (list) {
      list.push(resolve)
      return
    }
    metaPending.set(id, [resolve])
    scheduleMetaFlush()
  })
}

/** Enqueue many ids at once (prefetch) — still one debounced bulk HTTP call. */
export function enqueueQuietMetaBackfillMany(mediaIds: number[]): void {
  for (const mediaId of mediaIds) {
    void enqueueQuietMetaBackfill(mediaId)
  }
}

/**
 * Heuristic image backfill used by viewer when dims are missing.
 * Metadata via bulk queue; thumb via explicit regen so filmstrip can paint.
 */
export function enqueueQuietImageBackfill(mediaId: number): Promise<boolean> {
  const id = Number(mediaId)
  if (!id) return Promise.resolve(false)

  return enqueueQuietMetaBackfill(id).then(async (metaOk) => {
    const thumbOk = await enqueueImageThumbAndMeta(id)
    return metaOk || thumbOk
  })
}

/** @deprecated Prefer enqueueQuietMetaBackfill — same batch path. */
export function enqueueQuietVideoMetaBackfill(mediaId: number): Promise<boolean> {
  return enqueueQuietMetaBackfill(mediaId)
}

export function resetQuietMediaBackfillForTests(): void {
  metaSettled.clear()
  thumbSettled.clear()
  metaPending.clear()
  if (metaFlushTimer != null) {
    clearTimeout(metaFlushTimer)
    metaFlushTimer = null
  }
  metaFlushChain = Promise.resolve()
}
