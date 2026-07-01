import {ref, watch, onBeforeUnmount} from 'vue'
import {useTasksStore} from '@/stores/tasks'
import {useItemsStore} from '@/stores/items'
import {useSettingsStore} from '@/stores/settings'
import {useEventBus} from '@/utils/eventBus'
import {typedApi} from '@/services/typedApi'
import type { MediaItem } from '@/types/stores'

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

  const timeline = ref<GeneratorState>({
    active: false,
    stopped: false,
  })

  const timeout = ref<ReturnType<typeof setTimeout> | null>(null)
  const processedVideoIds = ref(new Set<number>())
  const lastItemsCount = ref(0)


  const createVideoGrid = (input: string, output: string): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      typedApi.taskCreateGrid({
        input: input,
        output: output,
        width: 180,
        cols: 3,
        rows: 3,
      })
        .then((res) => {
          resolve(res)
        })
        .catch((e) => {
          reject(e)
        })
    })
  }

  const createVideoTimeline = (video: MediaItem): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      typedApi.taskCreateTimeline({ id: video.id, path: video.path })
        .then((res) => {
          itemsStore.refreshThumb(video.id, {broadcast: false})
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

  const createTimelines = async (videos: MediaItem[]): Promise<void> => {
    if (timeline.value.active) return

    timeline.value.active = true
    timeline.value.stopped = false

    const taskId = tasksStore.setTask({
      title: 'Generating timeline images',
      icon: 'view-column',
      action: () => {
        timeline.value.stopped = true
      },
    })

    try {
      let completed = 0
      for (const video of videos) {
        if (timeline.value.stopped) break

        completed++
        tasksStore.updateTask(taskId, {
          subtitle: `${completed} of ${videos.length}`,
          progress: (completed / videos.length) * 100,
        })

        try {
          await createVideoTimeline(video)
        } catch (error) {
          console.error(`Failed to create timeline for video ${video.id}:`, error)
        }
      }
    } catch (error) {
      console.error('Error in createTimelines:', error)
    } finally {
      timeline.value.active = false
      tasksStore.removeTask(taskId)
    }
  }

  const getVideosToProcess = (videos: MediaItem[]): MediaItem[] => {
    if (!Array.isArray(videos) || !videos.length) return []

    return videos.filter((video) => video?.id && !processedVideoIds.value.has(video.id))
  }

  const markVideosProcessed = (videos: MediaItem[]): void => {
    for (const video of videos) {
      if (video?.id) processedVideoIds.value.add(video.id)
    }
  }

  const resetProcessedVideos = (): void => {
    processedVideoIds.value = new Set()
  }

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
    timeline.value.stopped = false

    timeout.value = setTimeout(() => {
      const videosToProcess = getVideosToProcess(videos)
      if (!videosToProcess.length) return

      markVideosProcessed(videosToProcess)

      if (!grid.value.active && settingsStore.videoPreviewStatic === 'grid') {
        void createGrids(videosToProcess)
      }

      if (!timeline.value.active &&
        (settingsStore.videoPreviewHover === 'timeline' ||
          Number(itemsStore.view) === 2)) {
        void createTimelines(videosToProcess)
      }
    }, 3000)
  }

  watch(() => itemsStore.itemsOnPage, (videos) => {
    if (itemsStore.type === 'media') {
      generateImages(videos)
    }
  })

  const cleanup = (): void => {
    if (timeout.value) clearTimeout(timeout.value)
    grid.value.stopped = true
    timeline.value.stopped = true
  }

  onBeforeUnmount(cleanup)

  return {
    grid,
    timeline,
    generateImages,
    createGrids,
    createTimelines,
    cleanup,
  }
}
