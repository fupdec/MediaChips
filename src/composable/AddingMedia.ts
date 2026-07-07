import {computed, nextTick} from 'vue'
import {i18n} from '@/i18n/loadLocale'
import {typedApi} from '@/services/typedApi'
import {setNotification} from '@/services/notificationService'
import {parseFilePath} from '@/services/pathTagParser'
import {transformTextToArray} from '@/services/formatUtils'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useTasksStore} from '@/stores/tasks'
import {useEventBus} from '@/utils/eventBus'
import type { ParsePathTagEntry } from '@shared/api/responses'
import type { MediaType } from '@/types/media'
import type { AddedMediaEntry } from '@/stores/tasks'
import {
  buildExtensionPathRegex,
  getDefaultMediaTypeId,
  inferMediaTypeFromPaths,
  parseMediaTypeExtensions,
} from '@/utils/mediaType'




const filterPathsByExtensions = (paths: string[], extensions: string): string[] => {
  const allowed = parseMediaTypeExtensions(extensions)

  return paths.filter((filePath: string) => {
    const ext = String(filePath).split('.').pop()?.toLowerCase()
    return ext && allowed.includes(ext)
  })
}

const ADD_MEDIA_CONCURRENCY = 3

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
  shouldStop: () => boolean,
): Promise<void> {
  if (!items.length) return

  let nextIndex = 0
  const workerCount = Math.min(Math.max(limit, 1), items.length)

  await Promise.all(Array.from({length: workerCount}, async () => {
    while (nextIndex < items.length) {
      if (shouldStop()) break

      const currentIndex = nextIndex
      nextIndex += 1
      await worker(items[currentIndex])
    }
  }))
}

const resolveMediaTypeForAdding = (
  mediaTypes: MediaType[],
  {
    mediaTypeId,
    paths,
    directFiles,
    skipFileScan,
  }: {
    mediaTypeId: number | null | undefined
    paths: string[]
    directFiles: string[]
    skipFileScan: boolean
  },
): MediaType | null => {
  const explicitId = mediaTypeId == null ? null : Number(mediaTypeId)
  if (explicitId) {
    const explicitType = mediaTypes.find((item) => item.id === explicitId)
    if (explicitType) return explicitType
  }

  const pathsToInfer = skipFileScan && directFiles.length ? directFiles : paths
  const inferredType = inferMediaTypeFromPaths(pathsToInfer, mediaTypes)
  if (inferredType) return inferredType

  const fallbackId = getDefaultMediaTypeId(mediaTypes)
  return fallbackId == null
    ? null
    : mediaTypes.find((item) => item.id === fallbackId) || null
}

let addMediaInProgress = false

export const useMediaAdding = () => {
  const appStore = useAppStore()
  const itemsStore = useItemsStore()
  const tasksStore = useTasksStore()
  const eventBus = useEventBus()
  const t = i18n.global.t

  const ENV = computed(() => itemsStore.environment)
  const mediaTypes = computed(() => appStore.mediaTypes)

  const task = computed({
    get() {
      return tasksStore.mediaAdding
    },
    set(value) {
      tasksStore.mediaAdding = value
    },
  })

  const handleAddMedia = async (action?: () => void) => {
    await addMedia()
    if (action && typeof action === 'function') {
      action()
    }
  }

  const handleAddMediaEvent: import('mitt').Handler = (event) => {
    void handleAddMedia(typeof event === 'function' ? event as () => void : undefined)
  }

  const openMediaAddingProcess = async () => {
    if (task.value.dialogProcess) return
    await nextTick()
    task.value.dialogProcess = true
  }

  const openProcessAction = () => ({
    id: 'open-media-adding-process',
    text: t('media.adding.open_process_dialog'),
    icon: 'open-in-new',
    action: openMediaAddingProcess,
    hide: true,
  })

  const addMedia = async () => {
    if (addMediaInProgress) return
    addMediaInProgress = true

    const skipFileScan = task.value.skipFileScan
    const directFiles = skipFileScan ? [...task.value.directFiles] : []
    const savedMediaTypeId = task.value.media_type_id

    task.value.active = true
    task.value.status = t('media.adding.scanning_files')
    task.value.processed = ''
    task.value.progress = 0
    task.value.stopped = false
    task.value.finished = false
    task.value.current = 0
    task.value.total = 0
    task.value.errors = []
    task.value.duplicates = []
    task.value.added = []
    task.value.addedMedia = []
    task.value.parsingTags = false
    task.value.suggestedTags = []
    task.value.videoSuggestedTags = []
    task.value.addedMediaTypeId = null
    task.value.addedMediaType = null
    task.value.recognizingObjects = false
    task.value.objectRecognitionProgress = 0
    task.value.objectRecognitionProcessed = 0
    task.value.objectRecognitionTotal = 0
    task.value.objectRecognitionRemaining = 0
    task.value.skipFileScan = false
    task.value.directFiles = []
    task.value.media_type_id = savedMediaTypeId

    const taskData = {
      title: 'Adding files',
      icon: 'file-plus',
      click: () => {
        task.value.dialogProcess = true
      },
      action: () => {
        task.value.stopped = true
      },
    }

    const taskId = await tasksStore.setTask(taskData)
    let keepTaskAfterComplete = false

    const pathsForType = transformTextToArray(task.value.paths)
    const mediaType = resolveMediaTypeForAdding(mediaTypes.value, {
      mediaTypeId: task.value.media_type_id || ENV.value.media_type_id,
      paths: pathsForType,
      directFiles,
      skipFileScan,
    })

    if (!mediaType) {
      console.error('Media type not found')
      task.value.finished = true
      task.value.active = false
      setNotification({
        title: 'Error',
        text: 'Media type not found',
      })
      addMediaInProgress = false
      return
    }

    task.value.addedMediaTypeId = mediaType.id
    task.value.addedMediaType = mediaType.type ?? null

    const extensions = mediaType.extensions ?? ''
    const regexString = JSON.stringify(buildExtensionPathRegex(extensions))

    const paths = pathsForType
    const excluded = transformTextToArray(task.value.excluded)

    let files: string[] = []

    try {
      if (skipFileScan && directFiles.length > 0) {
        files = filterPathsByExtensions(directFiles, extensions)
        task.value.status = t('media.adding.preparing_files', {count: files.length})
      } else {
        for (let pathIndex = 0; pathIndex < paths.length; pathIndex += 1) {
          const entryPath = paths[pathIndex]
          task.value.status = paths.length > 1
            ? `${t('media.adding.scanning_files')} (${pathIndex + 1}/${paths.length})`
            : t('media.adding.scanning_files')
          task.value.processed = t('media.adding.in_progress', {
            current: pathIndex + 1,
            total: paths.length,
          })

          const response = await typedApi.getFileList({
            path: entryPath,
            filter: regexString,
            excluded: task.value.is_exclude ? excluded : [],
          })

          files = files.concat(response.data)
        }
      }

      files = files.filter((filePath: string) => {
        const filename = filePath.split('\\').pop()?.split('/').pop() ?? ''
        return !filename.match(/^\._/)
      })

      task.value.status = t('media.adding.gathering_metadata')
      task.value.total = files.length
      task.value.current = 0
      task.value.progress = 0
      task.value.processed = t('media.adding.in_progress', {current: 0, total: files.length})

      const percentage = files.length > 0 ? 100 / files.length : 0
      const addedForParsing: AddedMediaEntry[] = []
      let lastProgressUpdate = 0
      let current = 0

      const processFile = async (filePath: string) => {
        try {
          const response = await typedApi.addMedia({
            path: filePath,
            type: mediaType,
            is_check_duplicates: task.value.is_check_duplicates,
          })

          if (response.status === 202) {
            const data = response.data
            task.value.duplicates.push({
              path: filePath,
              duplicate: data.duplicate,
            })
          } else if (response.status === 201) {
            task.value.added.push(filePath)

            if (response.data?.id) {
              task.value.addedMedia.push({
                path: filePath,
                mediaId: response.data.id,
              })
            }

            if (task.value.is_parsing && response.data?.id) {
              addedForParsing.push({path: filePath, mediaId: response.data.id})
            }
          }
        } catch (error) {
          console.error(`Error adding file ${filePath}:`, error)
          task.value.errors.push(filePath)
        }

        current += 1
        await updateProgress()
      }

      const updateProgress = async (force = false) => {
        const now = Date.now()
        if (!force && now - lastProgressUpdate < 150) return

        lastProgressUpdate = now
        const progress = Math.min(current * percentage, 100)

        task.value.current = current
        task.value.progress = progress
        task.value.processed = t('media.adding.in_progress', {current, total: files.length})

        await tasksStore.updateTask(taskId, {
          subtitle: t('media.adding.in_progress', {current, total: files.length}),
          progress,
        })
      }

      await runWithConcurrency(
        files,
        ADD_MEDIA_CONCURRENCY,
        processFile,
        () => task.value.stopped,
      )

      await updateProgress(true)

      if (addedForParsing.length > 0) {
        task.value.status = t('media.adding.adding_metadata')
        await parseTagsForAddedMedia(addedForParsing)
      }

      if (task.value.added.length > 0) {
        await suggestTagsFromAddedFiles()

        task.value.finished = true
        task.value.active = false
        task.value.media_type_id = null
        task.value.status = t('media.adding.complete')
        keepTaskAfterComplete = String(mediaType.type || '').toLowerCase() === 'video'

        if (keepTaskAfterComplete) {
          await tasksStore.updateTask(taskId, {
            subtitle: t('media.adding.added_count', {count: task.value.added.length}),
            progress: 100,
            color: 'success',
            done: true,
            action: () => {},
          })
        }

        setNotification({
          type: 'success',
          title: t('media.adding.complete'),
          text: t('media.adding.added_count', {count: task.value.added.length}),
          actions: [openProcessAction()],
        })
      } else {
        task.value.finished = true
        task.value.active = false
        task.value.media_type_id = null
        task.value.status = t('media.adding.complete')

        setNotification({
          type: 'info',
          title: t('media.adding.complete'),
          text: t('media.adding.no_new_media'),
          actions: [openProcessAction()],
        })
      }

      if (
        !ENV.value.media_type_id
        || Number(ENV.value.media_type_id) === Number(mediaType.id)
      ) {
        eventBus.emit('getItemsFromDb', {
          ids: [],
          type: 'media',
        })
      }

      eventBus.emit('update:watcher')
    } catch (error) {
      console.error('Error in addMedia process:', error)
      const message = error instanceof Error ? error.message : String(error)
      setNotification({
        title: 'Error adding files',
        text: message,
      })
      task.value.status = null
      task.value.errors.push(message)
    } finally {
      addMediaInProgress = false
      if (!keepTaskAfterComplete) {
        await tasksStore.removeTask(taskId)
      }
    }
  }

  const chunkArray = <T>(items: T[], size = 100): T[][] => {
    const chunks: T[][] = []
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size))
    }
    return chunks
  }

  const parseTagsForAddedMedia = async (
    items: AddedMediaEntry[],
    {onlyNew = false}: {onlyNew?: boolean} = {},
  ): Promise<number> => {
    if (!items?.length) return 0

    let parsedCount = 0

    for (const chunk of chunkArray(items, 100)) {
      if (task.value.stopped) break

      let vals: ParsePathTagEntry[] = []
      try {
        const parseResponse = await typedApi.parsePathTags({
          paths: chunk,
        })
        vals = parseResponse.data || []
      } catch (error) {
        console.error('Error parsing tags for added media:', error)
        vals = chunk.flatMap((item) => parseFilePath(item.path, item.mediaId, {
          tags: appStore.tags,
          assigned: itemsStore.assigned,
        }))
      }

      for (const valsChunk of chunkArray(vals, onlyNew ? 50 : 500)) {
        if (!valsChunk.length) continue

        if (onlyNew) {
          for (const item of valsChunk) {
            const response = await typedApi.createTagsInMediaOne({data: item})
            if (response.data?.[1]) parsedCount += 1
          }
        } else {
          await typedApi.postTagsInMedia(valsChunk)
          parsedCount += valsChunk.length
        }
      }
    }

    return parsedCount
  }

  const reparseTagsForAddedMedia = async (): Promise<number> => {
    const items = task.value.addedMedia || []
    if (!items.length || task.value.parsingTags) return 0

    task.value.parsingTags = true
    const previousStatus = task.value.status

    try {
      task.value.status = t('media.adding.adding_metadata')
      const parsedCount = await parseTagsForAddedMedia(items, {onlyNew: true})

      const mediaIds = [...new Set(items.map((item) => item.mediaId))]
      if (mediaIds.length > 0) {
        eventBus.emit('getItemsFromDb', {
          ids: mediaIds,
          type: 'media',
        })
      }

      setNotification({
        type: parsedCount > 0 ? 'success' : 'info',
        title: t('media.adding.reparse_tags'),
        text: parsedCount > 0
          ? t('media.adding.reparse_tags_added', {count: parsedCount})
          : t('media.adding.reparse_tags_none'),
        icon: 'text-box-search',
      })

      return parsedCount
    } finally {
      task.value.parsingTags = false
      task.value.status = previousStatus || t('media.adding.complete')
    }
  }

  const uniqueNames = (items: string[]): string[] => {
    const seen = new Set<string>()
    return items.filter((name: string) => {
      const key = String(name || '').trim().toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  const suggestTagsFromAddedFiles = async (): Promise<void> => {
    const names: string[] = []

    try {
      task.value.status = t('media.adding.suggesting_tags_from_paths')
      const response = await typedApi.suggestTagsFromPaths({
        paths: task.value.added,
        limit: 30,
        maxWords: 3,
        excludeExisting: true,
      })

      const suggestions = response.data?.suggestions || []
      names.push(...suggestions
        .map((item) => item.word)
        .filter((word): word is string => Boolean(word))
        .slice(0, 30))
    } catch (error) {
      console.error('Error suggesting tags from added files:', error)
    }

    task.value.suggestedTags = uniqueNames(names).slice(0, 80)
  }

  const setupEventListeners = (): void => {
    eventBus.on('addMedia', handleAddMediaEvent)
  }

  const cleanupEventListeners = (): void => {
    eventBus.off('addMedia', handleAddMediaEvent)
    if (task.value) {
      task.value.stopped = true
    }
  }

  return {
    task,
    addMedia,
    handleAddMedia,
    parseTagsForAddedMedia,
    reparseTagsForAddedMedia,
    setupEventListeners,
    cleanupEventListeners,
  }
}
