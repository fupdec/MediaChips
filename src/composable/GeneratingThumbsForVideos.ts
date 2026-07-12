import {ref, watch, onBeforeUnmount} from 'vue'
import {useTasksStore} from '@/stores/tasks'
import {useItemsStore} from '@/stores/items'
import {useSettingsStore} from '@/stores/settings'
import {useEventBus} from '@/utils/eventBus'
import {typedApi} from '@/services/typedApi'
import {visibleItemIds} from '@/utils/visibleItemsWindow'
import {buildVideoGridTaskParams} from '@shared/videoPreview'
import type { MediaItem } from '@/types/stores'

const GENERATION_WINDOW_LIMIT = 24

interface GeneratorState {
  active: boolean
  stopped: boolean
}

export default function useVideoImageGenerator() {
  const tasksStore = useTasksStore()
  const itemsStore = useItemsStore()
  const settingsStore = useSettingsStore()
  const eventBus = useEventBus()

  const grid = ref<GeneratorState>({
    active: false,
    stopped: false,
  })

  const timeout = ref<ReturnType<typeof setTimeout> | null>(null)
  const processedGridVideoIds = ref(new Set<number>())
  const lastItemsCount = ref(0)

  const createVideoGrid = (input: string, output: string): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      typedApi.taskCreateGrid(buildVideoGridTaskParams(input, output))
        .then((res) => {
          resolve(res)
        })
        .catch((e) => {
          reject(e)
        })
    })
  }

  const createGrids = async (videos: MediaItem[]): Promise<void> => {
    if (grid.value.active) return

    grid.value.active = true
    grid.value.stopped = false

    const taskId = tasksStore.setTask({
      title: 'Generating grids images',
      icon: 'apps',
      action: () => {
        grid.value.stopped = true
      },
    })

    try {
      let completed = 0
      for (const video of videos) {
        if (grid.value.stopped) break

        completed++
        tasksStore.updateTask(taskId, {
          subtitle: `${completed} of ${videos.length}`,
          progress: (completed / videos.length) * 100,
        })

        try {
          if (video.path) {
            await createVideoGrid(video.path, `${video.id}.jpg`)
          }

          itemsStore.refreshThumb(video.id, {broadcast: false})
          eventBus.emit('updateVideoFrames', video.id)
          eventBus.emit('getItemsFromDb', {
            ids: [video.id],
            type: 'media',
          })
        } catch (error) {
          console.error(`Failed to create grid for video ${video.id}:`, error)
        }
      }
    } catch (error) {
      console.error('Error in createGrids:', error)
    } finally {
      grid.value.active = false
      tasksStore.removeTask(taskId)
    }
  }

  const getVideosToProcess = (videos: MediaItem[]): MediaItem[] => {
    if (!Array.isArray(videos) || !videos.length) return []

    return videos.filter((video) => video?.id && !processedGridVideoIds.value.has(video.id))
  }

  const markVideosProcessed = (videos: MediaItem[]): void => {
    for (const video of videos) {
      if (video?.id) processedGridVideoIds.value.add(video.id)
    }
  }

  const resetProcessedVideos = (): void => {
    processedGridVideoIds.value = new Set()
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

  const shouldGenerateGrid = () => !grid.value.active && (
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

    if (timeout.value) {
      clearTimeout(timeout.value)
      timeout.value = null
    }

    grid.value.stopped = false

    timeout.value = setTimeout(() => {
      if (!shouldGenerateGrid()) return

      const gridVideos = getVideosToProcess(videos)
      if (!gridVideos.length) return

      markVideosProcessed(gridVideos)
      void createGrids(gridVideos)
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
  }

  onBeforeUnmount(cleanup)

  return {
    grid,
    generateImages,
    createGrids,
    cleanup,
  }
}
