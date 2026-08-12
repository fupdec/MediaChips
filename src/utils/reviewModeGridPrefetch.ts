import {ref} from 'vue'
import path from 'path-browserify'
import {typedApi} from '@/services/typedApi'
import {buildVideoGridTaskParams} from '@shared/videoPreview'
import type {MediaItem} from '@/types/stores'

export type ReviewGridStatus = 'unknown' | 'ready' | 'missing' | 'generating'

const statusById = new Map<number, ReviewGridStatus>()
const generateWaiters = new Map<number, Array<() => void>>()

/** Bumped on status/queue changes so Vue can react outside Pinia. */
export const reviewGridStatusVersion = ref(0)

let prefetchToken = 0
let neighborQueue: number[] = []
let neighborMediaById: Record<number, MediaItem> = {}
let neighborWorkerRunning = false
let generateChain: Promise<void> = Promise.resolve()
let focusMediaId: number | null = null

function bumpStatusVersion() {
  reviewGridStatusVersion.value += 1
}

export function reviewGridFilePath(mediaPath: string, mediaId: number): string {
  return path.join(mediaPath, 'videos', 'grids', `${mediaId}.jpg`)
}

export function getReviewGridStatus(mediaId: number): ReviewGridStatus {
  return statusById.get(mediaId) ?? 'unknown'
}

export function setReviewGridStatus(mediaId: number, status: ReviewGridStatus): void {
  statusById.set(mediaId, status)
  bumpStatusVersion()
  if (status === 'ready' || status === 'missing') {
    const waiters = generateWaiters.get(mediaId)
    if (waiters?.length) {
      generateWaiters.delete(mediaId)
      for (const wake of waiters) wake()
    }
  }
}

/** True while any review grid createGrid is in flight (holds ffmpeg). */
export function isAnyReviewGridBusy(): boolean {
  for (const status of statusById.values()) {
    if (status === 'generating') return true
  }
  return false
}

/** True while a neighbor grid is generating or queued for warmup. */
export function isReviewGridWarmupPending(mediaId: number | null | undefined): boolean {
  if (mediaId == null || !Number.isFinite(mediaId)) return false
  const status = getReviewGridStatus(mediaId)
  if (status === 'generating') return true
  return status === 'missing' && neighborQueue.includes(mediaId)
}

export function clearReviewGridPrefetch(): void {
  prefetchToken += 1
  statusById.clear()
  neighborQueue = []
  neighborMediaById = {}
  generateWaiters.clear()
  focusMediaId = null
  bumpStatusVersion()
}

/** Serialize createGrid so Review current + neighbor warmup never stampede ffmpeg. */
export function runExclusiveGridGenerate<T>(task: () => Promise<T>): Promise<T> {
  const run = generateChain.then(task, task)
  generateChain = run.then(() => undefined, () => undefined)
  return run
}

export function waitForReviewGridReady(
  mediaId: number,
  timeoutMs = 120_000,
): Promise<boolean> {
  const current = getReviewGridStatus(mediaId)
  if (current === 'ready') return Promise.resolve(true)
  if (current === 'missing') return Promise.resolve(false)

  return new Promise((resolve) => {
    let settled = false
    const finish = (ready: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const list = generateWaiters.get(mediaId)
      if (list) {
        const next = list.filter((entry) => entry !== wake)
        if (next.length) generateWaiters.set(mediaId, next)
        else generateWaiters.delete(mediaId)
      }
      resolve(ready)
    }

    const timer = setTimeout(() => {
      // Stale "generating" must not block Review forever.
      if (getReviewGridStatus(mediaId) === 'generating') {
        setReviewGridStatus(mediaId, 'missing')
      }
      finish(getReviewGridStatus(mediaId) === 'ready')
    }, timeoutMs)

    const wake = () => {
      const status = getReviewGridStatus(mediaId)
      if (status === 'ready') {
        finish(true)
        return
      }
      if (status === 'missing') {
        finish(false)
      }
    }

    const list = generateWaiters.get(mediaId) || []
    list.push(wake)
    generateWaiters.set(mediaId, list)
  })
}

/** Mark ready/missing after createGrid finishes (even if the UI moved on). */
export async function finalizeReviewGridGenerate(
  mediaId: number,
  mediaPath: string,
  outcome: 'success' | 'failed',
): Promise<void> {
  if (outcome === 'failed') {
    if (getReviewGridStatus(mediaId) === 'generating') {
      setReviewGridStatus(mediaId, 'missing')
    }
    return
  }
  if (!mediaPath) {
    setReviewGridStatus(mediaId, 'ready')
    return
  }
  try {
    const filePath = reviewGridFilePath(mediaPath, mediaId)
    const response = await typedApi.checkFilesExist([filePath])
    const exists = response.data?.results?.[filePath] === true
    setReviewGridStatus(mediaId, exists ? 'ready' : 'missing')
  } catch {
    setReviewGridStatus(mediaId, 'ready')
  }
}

function isGridAlreadyExistsError(error: unknown): boolean {
  const err = error as {response?: {data?: {message?: string}}; message?: string} | null
  const message = String(err?.response?.data?.message || err?.message || error || '')
  return /already exists/i.test(message)
}

export async function probeReviewGridStatuses(
  mediaPath: string,
  mediaIds: number[],
): Promise<void> {
  const ids = [...new Set(mediaIds.filter((id) => Number.isFinite(id) && id > 0))]
  if (!mediaPath || !ids.length) return

  const unknown = ids.filter((id) => getReviewGridStatus(id) === 'unknown')
  if (!unknown.length) return

  const paths = unknown.map((id) => reviewGridFilePath(mediaPath, id))
  try {
    const response = await typedApi.checkFilesExist(paths)
    const results = response.data?.results || {}
    for (let i = 0; i < unknown.length; i++) {
      const id = unknown[i]
      const exists = results[paths[i]] === true
      if (getReviewGridStatus(id) === 'generating') continue
      setReviewGridStatus(id, exists ? 'ready' : 'missing')
    }
  } catch (error) {
    console.error(error)
  }
}

async function generateOneNeighbor(mediaId: number): Promise<void> {
  const item = neighborMediaById[mediaId]
  if (!item?.path || !item.id) {
    setReviewGridStatus(mediaId, 'missing')
    return
  }
  if (getReviewGridStatus(mediaId) === 'ready') return

  setReviewGridStatus(mediaId, 'generating')
  try {
    await runExclusiveGridGenerate(async () => {
      if (getReviewGridStatus(mediaId) === 'ready') return
      try {
        await typedApi.taskCreateGrid(
          buildVideoGridTaskParams(item.path!, `${mediaId}.jpg`),
        )
        setReviewGridStatus(mediaId, 'ready')
      } catch (error) {
        if (isGridAlreadyExistsError(error)) {
          setReviewGridStatus(mediaId, 'ready')
          return
        }
        console.error(error)
        setReviewGridStatus(mediaId, 'missing')
      }
    })
  } catch (error) {
    console.error(error)
    if (getReviewGridStatus(mediaId) === 'generating') {
      setReviewGridStatus(mediaId, 'missing')
    }
  } finally {
    if (getReviewGridStatus(mediaId) === 'generating') {
      setReviewGridStatus(mediaId, 'missing')
    }
  }
}

const NEIGHBOR_WARMUP_DELAY_MS = 2_000

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitWhileFocusGenerating(token: number): Promise<void> {
  let waited = 0
  while (token === prefetchToken && waited < 120_000) {
    if (focusMediaId == null) return
    if (getReviewGridStatus(focusMediaId) !== 'generating') return
    await sleep(350)
    waited += 350
  }
}

/** Wait until the focused item leaves unknown/generating, then settle briefly. */
async function waitForFocusSettledBeforeNeighbors(token: number): Promise<void> {
  let waited = 0
  while (token === prefetchToken && waited < 120_000) {
    if (focusMediaId == null) return
    const status = getReviewGridStatus(focusMediaId)
    // MediaStage owns current createGrid — wait until it finishes or is already known.
    if (status === 'ready' || status === 'missing') break
    await sleep(350)
    waited += 350
  }
  if (token !== prefetchToken) return
  // Let the current Review UI settle before stealing ffmpeg for neighbors.
  await sleep(NEIGHBOR_WARMUP_DELAY_MS)
}

async function pumpNeighborQueue(token: number): Promise<void> {
  if (neighborWorkerRunning) return
  if (!neighborQueue.length) return
  neighborWorkerRunning = true
  try {
    await waitForFocusSettledBeforeNeighbors(token)
    if (token !== prefetchToken) return

    while (neighborQueue.length && token === prefetchToken) {
      // If the user navigated and focus is generating again, yield.
      await waitWhileFocusGenerating(token)
      if (token !== prefetchToken) return

      const mediaId = neighborQueue.shift()!
      bumpStatusVersion()
      if (getReviewGridStatus(mediaId) === 'ready') continue
      await generateOneNeighbor(mediaId)
    }
  } finally {
    neighborWorkerRunning = false
    if (neighborQueue.length && token === prefetchToken) {
      void pumpNeighborQueue(token)
    }
  }
}

/**
 * Probe current/next/prev so navigation can reuse known ready/missing status.
 * Neighbor warm-generate is disabled for now (current item stays MediaStage's job).
 */
export function scheduleReviewGridPrefetch(options: {
  mediaPath: string
  mediaIds: number[]
  index: number
  mediaById: Record<number, MediaItem>
}): void {
  const {mediaPath, mediaIds, index, mediaById} = options

  if (!mediaPath || !mediaIds.length || index < 0) return

  const token = ++prefetchToken
  neighborMediaById = mediaById
  neighborQueue = []

  const currentId = mediaIds[index] ?? null
  const nextId = mediaIds[index + 1]
  const prevId = mediaIds[index - 1]
  focusMediaId = currentId

  const windowIds = [currentId, nextId, prevId].filter(
    (id): id is number => id != null && Number.isFinite(id),
  )

  void (async () => {
    await probeReviewGridStatuses(mediaPath, windowIds)
    if (token !== prefetchToken) return
    bumpStatusVersion()
  })()
}
