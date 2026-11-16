import {ref, watch, onBeforeUnmount} from 'vue'
import path from 'path-browserify'
import {useI18n} from 'vue-i18n'
import {useTasksStore} from '@/stores/tasks'
import {useItemsStore} from '@/stores/items'
import {useSettingsStore} from '@/stores/settings'
import {useAppStore} from '@/stores/app'
import {useEventBus} from '@/utils/eventBus'
import {useItemsListSync} from '@/composable/itemsListSync'
import {typedApi} from '@/services/typedApi'
import {visibleItemIds} from '@/utils/visibleItemsWindow'
import {buildVideoGridTaskParams} from '@shared/videoPreview'
import type { MediaItem } from '@/types/stores'

const GENERATION_WINDOW_LIMIT = 24
/** Cap queued ids so long scrolls cannot enqueue the whole library. */
const PENDING_QUEUE_LIMIT = 48

interface GeneratorState {
  active: boolean
  stopped: boolean
}

function isGridAlreadyExistsError(error: unknown): boolean {
  const err = error as {response?: {data?: {message?: string}}; message?: string} | null
  const message = String(err?.response?.data?.message || err?.message || error || '')
  return /already exists/i.test(message)
}

function gridFilePath(mediaPath: string, mediaId: number): string {
  return path.join(mediaPath, 'videos', 'grids', `${mediaId}.jpg`)
}

export default function useVideoImageGenerator() {
  const {t} = useI18n()
  const tasksStore = useTasksStore()
  const itemsStore = useItemsStore()
  const settingsStore = useSettingsStore()
  const appStore = useAppStore()
  const eventBus = useEventBus()
  const listSync = useItemsListSync()

  const grid = ref<GeneratorState>({
    active: false,
    stopped: false,
  })

  const timeout = ref<ReturnType<typeof setTimeout> | null>(null)
  /** Ids already completed or known present for this window. */
  const processedGridVideoIds = ref(new Set<number>())
  /** Pending work — reordered toward currently visible ids on each pass. */
  const pendingById = ref(new Map<number, MediaItem>())
  const lastItemsCount = ref(0)
  let taskId: string | null = null

  const createVideoGrid = (input: string, output: string): Promise<unknown> => {
    return typedApi.taskCreateGrid(buildVideoGridTaskParams(input, output))
  }

  const filterVideosMissingGrids = async (videos: MediaItem[]): Promise<MediaItem[]> => {
    const mediaPath = appStore.mediaPath
    if (!mediaPath || !videos.length) return videos

    const paths = videos.map((video) => gridFilePath(mediaPath, Number(video.id)))
    try {
      const response = await typedApi.checkFilesExist(paths)
      const results = response.data?.results || {}
      return videos.filter((video, index) => results[paths[index]] !== true)
    } catch {
      // If the existence check fails, fall back to createGrid (server skips existing).
      return videos
    }
  }

  const pickNextPending = (): MediaItem | null => {
    if (!pendingById.value.size) return null

    const visible = visibleItemIds.value
    if (visible.length) {
      const visibleSet = new Set(visible.map((id) => Number(id)))
      for (const id of visibleSet) {
        const item = pendingById.value.get(id)
        if (item) return item
      }
    }

    return pendingById.value.values().next().value ?? null
  }

  const updateTaskProgress = (completed: number, total: number) => {
    if (!taskId) return
    tasksStore.updateTask(taskId, {
      subtitle: t('tasks_text.of_total', {completed, total}),
      progress: total > 0 ? (completed / total) * 100 : 0,
    })
  }

  const drainPendingGrids = async (): Promise<void> => {
    if (grid.value.active) return

    grid.value.active = true
    grid.value.stopped = false

    taskId = tasksStore.setTask({
      key: 'generating_grid_images',
      title: t('tasks_text.generating_grid_images'),
      icon: 'apps',
      action: () => {
        grid.value.stopped = true
      },
    })

    let completed = 0

    try {
      while (!grid.value.stopped) {
        const video = pickNextPending()
        if (!video?.id || !video.path) {
          if (!pendingById.value.size) break
          // Corrupt entry — drop and continue.
          if (video?.id) pendingById.value.delete(Number(video.id))
          else break
          continue
        }

        const id = Number(video.id)
        pendingById.value.delete(id)
        const total = completed + pendingById.value.size + 1
        completed += 1
        updateTaskProgress(completed, total)

        try {
          await createVideoGrid(video.path, `${video.id}.jpg`)
          processedGridVideoIds.value.add(id)
          itemsStore.refreshThumb(video.id, {broadcast: false})
          eventBus.emit('updateVideoFrames', video.id)
          listSync.getItemsFromDb({
            ids: [video.id],
            type: 'media',
          })
        } catch (error) {
          if (isGridAlreadyExistsError(error)) {
            processedGridVideoIds.value.add(id)
            continue
          }
          console.error(`Failed to create grid for video ${video.id}:`, error)
          // Leave unprocessed so a later visible pass can retry.
        }
      }
    } catch (error) {
      console.error('Error in createGrids:', error)
    } finally {
      grid.value.active = false
      if (taskId) {
        tasksStore.removeTask(taskId)
        taskId = null
      }
      // New ids may have arrived while we were finishing.
      if (pendingById.value.size && !grid.value.stopped) {
        void drainPendingGrids()
      }
    }
  }

  const enqueueVideos = async (videos: MediaItem[]): Promise<void> => {
    if (!videos.length) return

    const missing = await filterVideosMissingGrids(
      videos.filter((video) => video?.id && !processedGridVideoIds.value.has(Number(video.id))),
    )

    for (const video of missing) {
      const id = Number(video.id)
      if (!Number.isFinite(id)) continue
      pendingById.value.set(id, video)
    }

    // Prefer keeping visible ids when over cap.
    if (pendingById.value.size > PENDING_QUEUE_LIMIT) {
      const visible = new Set(visibleItemIds.value.map((id) => Number(id)))
      const entries = [...pendingById.value.entries()]
      entries.sort(([a], [b]) => {
        const aVis = visible.has(a) ? 0 : 1
        const bVis = visible.has(b) ? 0 : 1
        return aVis - bVis
      })
      pendingById.value = new Map(entries.slice(0, PENDING_QUEUE_LIMIT))
    }

    if (pendingById.value.size) {
      void drainPendingGrids()
    }
  }

  const pruneProcessedToWindow = (videos: MediaItem[]): void => {
    const keep = new Set(
      videos.map((video) => Number(video?.id)).filter((id) => Number.isFinite(id)),
    )
    if (!keep.size) {
      processedGridVideoIds.value = new Set()
      return
    }
    const next = new Set<number>()
    for (const id of processedGridVideoIds.value) {
      if (keep.has(id)) next.add(id)
    }
    processedGridVideoIds.value = next

    for (const id of [...pendingById.value.keys()]) {
      if (!keep.has(id)) pendingById.value.delete(id)
    }
  }

  const resetProcessedVideos = (): void => {
    processedGridVideoIds.value = new Set()
    pendingById.value = new Map()
  }

  const resolveVideosForGeneration = (videos: MediaItem[]): MediaItem[] => {
    if (!Array.isArray(videos) || !videos.length) return []

    const visible = visibleItemIds.value
    if (visible.length) {
      const visibleSet = new Set(visible.map((id) => Number(id)))
      return videos.filter((video) => visibleSet.has(Number(video.id)))
    }

    return videos.slice(0, GENERATION_WINDOW_LIMIT)
  }

  const shouldGenerateGrid = () => (
    settingsStore.videoPreviewStatic === 'grid' ||
    settingsStore.videoPreviewHover === 'timeline' ||
    Number(itemsStore.view) === 2
  )

  const generateImages = (videos: MediaItem[]): void => {
    if (!Array.isArray(videos)) return

    if (videos.length === 0) {
      resetProcessedVideos()
      lastItemsCount.value = 0
      return
    }

    if (videos.length < lastItemsCount.value) {
      resetProcessedVideos()
    }
    lastItemsCount.value = videos.length
    pruneProcessedToWindow(videos)

    if (timeout.value) {
      clearTimeout(timeout.value)
      timeout.value = null
    }

    timeout.value = setTimeout(() => {
      if (!shouldGenerateGrid()) return
      void enqueueVideos(videos)
    }, 3000)
  }

  const scheduleGenerationForCurrentPage = () => {
    if (itemsStore.type === 'media') {
      generateImages(resolveVideosForGeneration(itemsStore.itemsOnPage))
    }
  }

  watch(
    [() => itemsStore.itemsOnPage, visibleItemIds],
    ([videos]) => {
      if (itemsStore.type === 'media') {
        generateImages(resolveVideosForGeneration(videos as MediaItem[]))
      }
    },
  )

  watch(() => Number(itemsStore.view), () => {
    scheduleGenerationForCurrentPage()
  })

  watch(
    () => [settingsStore.videoPreviewStatic, settingsStore.videoPreviewHover],
    () => {
      scheduleGenerationForCurrentPage()
    },
  )

  const cleanup = (): void => {
    if (timeout.value) clearTimeout(timeout.value)
    grid.value.stopped = true
    pendingById.value = new Map()
  }

  onBeforeUnmount(cleanup)

  return {
    grid,
    generateImages,
    createGrids: enqueueVideos,
    cleanup,
  }
}
