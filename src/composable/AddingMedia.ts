import {computed, nextTick} from 'vue'
import {i18n} from '@/i18n/loadLocale'
import {typedApi} from '@/services/typedApi'
import {setNotification} from '@/services/notificationService'
import {scheduleDesktopChromeSync} from '@/services/desktopChrome'
import {parseFilePath} from '@/services/pathTagParser'
import {getReadableDuration, transformTextToArray} from '@/services/formatUtils'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useTasksStore} from '@/stores/tasks'
import {useWatcherStore} from '@/stores/watcher'
import {useMediaInboxStore} from '@/stores/mediaInbox'
import {useEventBus} from '@/utils/eventBus'
import {useItemsListSync} from '@/composable/itemsListSync'
import {removeWatcherNewPaths} from '@/utils/watcherReportUtils'
import type { ParsePathTagEntry } from '@shared/api/responses'
import type { MediaType } from '@/types/media'
import type { AddedMediaEntry, MediaAddingState } from '@/stores/tasks'
import {
  buildExtensionPathRegex,
  getDefaultMediaTypeId,
  inferMediaTypeFromPaths,
  parseMediaTypeExtensions,
  isImageMediaType,
  resolveTargetMediaTypesForAdding,
  combineMediaTypeExtensions,
  bucketFilesByMediaType,
} from '@/utils/mediaType'
import {ensureStarterMeta} from '@/services/ensureStarterMeta'
import {ONBOARDING_STEP_COUNT, saveOnboardingStep, shouldShowOnboarding} from '@/composable/useOnboarding'
import {getApiErrorMessage} from '@/types/vue'
import {
  FAST_IMPORT_AUTO_THRESHOLD,
  MEDIA_BULK_LITE_ADDED_CAP,
  MEDIA_BULK_LITE_HTTP_CHUNK,
} from '@shared/mediaBulkImport'




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

const filterPathsByExtensions = (paths: string[], extensions: string): string[] => {
  const allowed = parseMediaTypeExtensions(extensions)

  return paths.filter((filePath: string) => {
    const ext = String(filePath).split('.').pop()?.toLowerCase()
    return ext && allowed.includes(ext)
  })
}

const trimCappedAddedLists = (task: MediaAddingState) => {
  if (task.added.length > MEDIA_BULK_LITE_ADDED_CAP) {
    task.added = task.added.slice(-MEDIA_BULK_LITE_ADDED_CAP)
  }
  if (task.addedMedia.length > MEDIA_BULK_LITE_ADDED_CAP) {
    task.addedMedia = task.addedMedia.slice(-MEDIA_BULK_LITE_ADDED_CAP)
  }
}

const appendBulkLiteAddedResponse = (
  task: MediaAddingState,
  data: {
    inserted?: number
    added?: AddedMediaEntry[]
    errors?: string[]
  },
) => {
  task.addedTotal = (task.addedTotal || 0) + Number(data.inserted || 0)

  for (const entry of data.added || []) {
    task.added.push(entry.path)
    task.addedMedia.push({
      path: entry.path,
      mediaId: entry.mediaId,
    })
  }
  trimCappedAddedLists(task)

  for (const errPath of data.errors || []) {
    task.errors.push(errPath)
  }
  if (task.errors.length > MEDIA_BULK_LITE_ADDED_CAP) {
    task.errors = task.errors.slice(-MEDIA_BULK_LITE_ADDED_CAP)
  }
}

const ADD_MEDIA_CONCURRENCY = 3

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
  const watcherStore = useWatcherStore()
  const mediaInboxStore = useMediaInboxStore()
  const eventBus = useEventBus()
  const listSync = useItemsListSync()
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

    const {useFreeLibraryGate} = await import('@/composable/useFreeLibraryGate')
    const gate = useFreeLibraryGate()
    if (!(await gate.ensureCanImportMedia())) {
      task.value.active = false
      task.value.dialogProcess = false
      return
    }

    addMediaInProgress = true

    const skipFileScan = task.value.skipFileScan
    const directFiles = [...task.value.directFiles]
    const savedMediaTypeId = task.value.media_type_id
    const fromInbox = Boolean(task.value.fromInbox)

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
    task.value.addedTotal = 0
    task.value.addedMedia = []
    task.value.parsingTags = false
    task.value.suggestedTags = []
    task.value.addedMediaTypeId = null
    task.value.addedMediaType = null
    task.value.detectingFaces = false
    task.value.faceDetectionProgress = 0
    task.value.faceDetectionProcessed = 0
    task.value.faceDetectionTotal = 0
    task.value.faceDetectionRemaining = 0
    task.value.facesFound = 0
    task.value.notificationTaskId = null
    task.value.skipFileScan = false
    task.value.directFiles = []
    task.value.fromInbox = false
    task.value.media_type_id = savedMediaTypeId
    scheduleDesktopChromeSync()

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
    task.value.notificationTaskId = taskId
    let keepTaskAfterComplete = false

    const pathsForType = transformTextToArray(task.value.paths)
    const targetTypes = resolveTargetMediaTypesForAdding(
      mediaTypes.value,
      task.value.media_type_ids,
    )

    if (!targetTypes.length) {
      console.error('Media type not found')
      task.value.finished = true
      task.value.active = false
      tasksStore.removeTask(taskId)
      task.value.notificationTaskId = null
      setNotification({
        title: t('common.error'),
        text: t('media.adding.media_type_not_found'),
      })
      addMediaInProgress = false
      return
    }

    const primaryType = targetTypes.length === 1
      ? targetTypes[0]
      : (resolveMediaTypeForAdding(mediaTypes.value, {
        mediaTypeId: task.value.media_type_id || ENV.value.media_type_id,
        paths: pathsForType,
        directFiles,
        skipFileScan,
      }) || targetTypes[0])

    task.value.addedMediaTypeId = primaryType?.id ?? null
    task.value.addedMediaType = primaryType?.type ?? null

    const extensions = combineMediaTypeExtensions(targetTypes)
    const extensionList = parseMediaTypeExtensions(extensions)
    const regexString = JSON.stringify(buildExtensionPathRegex(extensions))
    const expandZips = targetTypes.some(isImageMediaType)

    const paths = pathsForType
    const excluded = transformTextToArray(task.value.excluded)

    let files: string[] = []
    const skippedZipMessages: string[] = []

    const appendFileListResponse = (responseData: {
      files?: string[]
      skippedZips?: Array<{ path?: string; reason?: string; message?: string }>
    } | string[]) => {
      // Backward-compatible if an older server still returns a bare array.
      if (Array.isArray(responseData)) {
        files = files.concat(responseData)
        return
      }
      files = files.concat(Array.isArray(responseData.files) ? responseData.files : [])
      for (const skipped of responseData.skippedZips || []) {
        skippedZipMessages.push(skipped.message || `Skipped ZIP: ${skipped.path || 'unknown'}`)
      }
    }

    const isZipPath = (filePath: string) => /\.zip$/i.test(filePath)

    const useRootsFastImport = Boolean(task.value.is_fast_import)
      && !skipFileScan
      && paths.length > 0

    try {
      if (useRootsFastImport) {
        task.value.is_parsing = false
        task.value.is_check_duplicates = false
        task.value.fast_import_locked = true
        task.value.status = t('media.adding.fast_import_roots_status', {
          count: paths.length,
          types: targetTypes.length,
        })
        task.value.total = targetTypes.length
        task.value.current = 0
        task.value.progress = 0
        task.value.processed = t('media.adding.in_progress', {
          current: 0,
          total: targetTypes.length,
        })

        let bulkInsertedTotal = 0
        let scannedTotal = 0
        const ensuredTypeIds: number[] = []

        for (let typeIndex = 0; typeIndex < targetTypes.length; typeIndex += 1) {
          if (task.value.stopped) break

          const mediaType = targetTypes[typeIndex]
          task.value.addedMediaTypeId = mediaType.id
          task.value.addedMediaType = mediaType.type ?? null
          task.value.status = t('media.adding.fast_import_roots_type', {
            name: mediaType.name || mediaType.type || String(mediaType.id),
            current: typeIndex + 1,
            total: targetTypes.length,
          })

          const typeFiles = directFiles.length
            ? filterPathsByExtensions(directFiles, String(mediaType.extensions || ''))
            : []

          try {
            const response = await typedApi.addMediaBulk({
              mode: 'lite',
              type: mediaType,
              roots: paths,
              files: typeFiles.length ? typeFiles : undefined,
              excluded: task.value.is_exclude ? excluded : [],
              expandZips: isImageMediaType(mediaType),
            })
            const data = response.data
            bulkInsertedTotal += Number(data.inserted || 0)
            scannedTotal += Number(data.scanned || 0)
            ensuredTypeIds.push(Number(mediaType.id))

            appendBulkLiteAddedResponse(task.value, data)
          } catch (error) {
            console.error('Bulk addMedia roots failed:', error)
            const message = getApiErrorMessage(error, t('media.adding.error_title'))
            task.value.errors.push(`${mediaType.name || mediaType.id}: ${message}`)
          }

          const doneTypes = typeIndex + 1
          const progress = Math.min((doneTypes / targetTypes.length) * 100, 100)
          const progressText = scannedTotal > 0
            ? t('media.adding.fast_import_roots_progress', {
              inserted: bulkInsertedTotal,
              scanned: scannedTotal,
              typesDone: doneTypes,
              typesTotal: targetTypes.length,
            })
            : t('media.adding.in_progress', {current: doneTypes, total: targetTypes.length})

          task.value.current = doneTypes
          task.value.progress = progress
          task.value.processed = progressText

          await tasksStore.updateTask(taskId, {
            subtitle: progressText,
            progress,
          })
        }

        const addedCount = bulkInsertedTotal
        task.value.addedTotal = addedCount
        task.value.total = scannedTotal || targetTypes.length
        task.value.current = scannedTotal || targetTypes.length

        if (addedCount > 0 && ensuredTypeIds.length) {
          try {
            await ensureStarterMeta({
              mediaTypeIds: [...new Set(ensuredTypeIds.filter((id) => Number.isFinite(id)))],
            })
          } catch (error) {
            console.error('Failed to ensure starter meta after adding media:', error)
          }
        }

        if (addedCount > 0) {
          task.value.finished = true
          task.value.active = false
          task.value.media_type_id = null
          task.value.status = t('media.adding.complete')
          keepTaskAfterComplete = true

          await tasksStore.updateTask(taskId, {
            subtitle: t('media.adding.added_count', {count: addedCount}),
            progress: 100,
            color: 'success',
            done: true,
            action: undefined,
          })

          setNotification({
            type: 'success',
            title: t('media.adding.complete'),
            text: t('media.adding.added_count', {count: addedCount}),
            actions: fromInbox
              ? [
                openProcessAction(),
                {
                  id: 'open-media-inbox-pending',
                  text: t('media_inbox.open_pending'),
                  icon: 'inbox-arrow-down',
                  action: () => mediaInboxStore.open('pending'),
                  hide: true,
                },
              ]
              : [openProcessAction()],
          })

          if (fromInbox) {
            const ids = (task.value.addedMedia || [])
              .map((entry) => Number(entry.mediaId))
              .filter((id) => Number.isFinite(id) && id > 0)
            if (ids.length) mediaInboxStore.enqueuePendingReview(ids)
          }

          if (shouldShowOnboarding(false)) {
            await saveOnboardingStep(ONBOARDING_STEP_COUNT - 1)
            await openMediaAddingProcess()
          }
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
          || targetTypes.some((item) => Number(item.id) === Number(ENV.value.media_type_id))
        ) {
          listSync.getItemsFromDb({
            ids: [],
            type: 'media',
          })
        }

        const resolvedWatcherPaths = [
          ...task.value.added,
          ...task.value.duplicates.map((entry) => entry.path),
        ]

        if (resolvedWatcherPaths.length > 0 && watcherStore.files.length > 0) {
          watcherStore.files = removeWatcherNewPaths(watcherStore.files, resolvedWatcherPaths)
        }

        eventBus.emit('update:watcher')
        if (addedCount > 0) {
          eventBus.emit('library:nav-counts-changed')
        }
        return
      }

      // skipFileScan: direct file drops/additions already have full paths;
      // avoid getFileList/lstat (which can surface OS access-denied errors).
      // ZIP drops still need expansion when adding images.
      if (skipFileScan && directFiles.length > 0) {
        const looseFiles = filterPathsByExtensions(directFiles, extensions)
        const zipFiles = expandZips ? directFiles.filter(isZipPath) : []
        files = [...looseFiles]

        for (let zipIndex = 0; zipIndex < zipFiles.length; zipIndex += 1) {
          const zipPath = zipFiles[zipIndex]
          task.value.status = t('media.adding.scanning_files')
          task.value.processed = t('media.adding.in_progress', {
            current: zipIndex + 1,
            total: zipFiles.length,
          })
          const response = await typedApi.getFileList({
            path: zipPath,
            filter: regexString,
            excluded: task.value.is_exclude ? excluded : [],
            expandZips: true,
            extensions: extensionList,
          })
          appendFileListResponse(response.data)
        }

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
            expandZips,
            extensions: extensionList,
          })

          appendFileListResponse(response.data)
        }

        if (directFiles.length > 0) {
          const looseFiles = filterPathsByExtensions(directFiles, extensions)
          files = [...new Set([...files, ...looseFiles])]

          if (expandZips) {
            for (const zipPath of directFiles.filter(isZipPath)) {
              const response = await typedApi.getFileList({
                path: zipPath,
                filter: regexString,
                excluded: task.value.is_exclude ? excluded : [],
                expandZips: true,
                extensions: extensionList,
              })
              appendFileListResponse(response.data)
            }
          }
        }
      }

      files = [...new Set(files)].filter((filePath: string) => {
        const filename = filePath.split('\\').pop()?.split('/').pop() ?? ''
        return !filename.match(/^\._/)
      })

      for (const message of skippedZipMessages) {
        task.value.errors.push(message)
      }

      const filesByType = bucketFilesByMediaType(files, targetTypes)
      const typedEntries = targetTypes
        .map((mediaType) => ({
          mediaType,
          files: filesByType.get(Number(mediaType.id)) || [],
        }))
        .filter((entry) => entry.files.length > 0)

      const allTypedFiles = typedEntries.flatMap((entry) => entry.files)
      if (!allTypedFiles.length && files.length) {
        // Extensions matched scan but not bucket (shouldn't happen) — keep raw list
        // on primary type so we don't silently drop files.
        typedEntries.push({mediaType: primaryType, files})
      }

      if (allTypedFiles.length > FAST_IMPORT_AUTO_THRESHOLD) {
        task.value.is_fast_import = true
        task.value.fast_import_locked = true
        task.value.is_parsing = false
        task.value.is_check_duplicates = false
      }

      const useFastImport = Boolean(task.value.is_fast_import)
      if (useFastImport) {
        task.value.is_parsing = false
      }

      task.value.status = useFastImport
        ? t('media.adding.fast_import_status', {count: allTypedFiles.length || files.length})
        : t('media.adding.gathering_metadata')
      task.value.total = allTypedFiles.length || files.length
      task.value.current = 0
      task.value.progress = 0
      task.value.processed = t('media.adding.in_progress', {
        current: 0,
        total: task.value.total,
      })

      const totalFiles = task.value.total
      const percentage = totalFiles > 0 ? 100 / totalFiles : 0
      const addedForParsing: AddedMediaEntry[] = []
      let lastProgressUpdate = 0
      let current = 0
      let bulkInsertedTotal = 0
      const progressStartedAt = Date.now()

      const formatAddingProgress = (done: number, total: number) => {
        if (done > 0 && done < total) {
          const elapsedSeconds = (Date.now() - progressStartedAt) / 1000
          const etaSeconds = Math.round((elapsedSeconds / done) * (total - done))
          if (etaSeconds > 0) {
            return t('media.adding.in_progress_eta', {
              current: done,
              total,
              eta: getReadableDuration(etaSeconds),
            })
          }
        }

        return t('media.adding.in_progress', {current: done, total})
      }

      const updateProgress = async (force = false) => {
        const now = Date.now()
        if (!force && now - lastProgressUpdate < 150) return

        lastProgressUpdate = now
        const progress = Math.min(current * percentage, 100)
        const progressText = formatAddingProgress(current, totalFiles)

        task.value.current = current
        task.value.progress = progress
        task.value.processed = progressText

        await tasksStore.updateTask(taskId, {
          subtitle: progressText,
          progress,
        })
      }

      const processFilesForType = async (mediaType: MediaType, typeFiles: string[]) => {
        if (useFastImport) {
          for (let offset = 0; offset < typeFiles.length; offset += MEDIA_BULK_LITE_HTTP_CHUNK) {
            if (task.value.stopped) break

            const chunk = typeFiles.slice(offset, offset + MEDIA_BULK_LITE_HTTP_CHUNK)
            try {
              const response = await typedApi.addMediaBulk({
                mode: 'lite',
                type: mediaType,
                files: chunk,
              })
              const data = response.data
              bulkInsertedTotal += Number(data.inserted || 0)

              appendBulkLiteAddedResponse(task.value, data)
            } catch (error) {
              console.error('Bulk addMedia chunk failed:', error)
              const message = error instanceof Error ? error.message : String(error)
              task.value.errors.push(`bulk chunk @${offset}: ${message}`)
              for (const filePath of chunk) {
                task.value.errors.push(filePath)
              }
              if (task.value.errors.length > 5_000) {
                task.value.errors = task.value.errors.slice(0, 5_000)
              }
            }

            current = Math.min(current + chunk.length, totalFiles)
            await updateProgress(true)
          }
          return
        }

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

        await runWithConcurrency(
          typeFiles,
          ADD_MEDIA_CONCURRENCY,
          processFile,
          () => task.value.stopped,
        )
      }

      for (const entry of typedEntries) {
        if (task.value.stopped) break
        task.value.addedMediaTypeId = entry.mediaType.id
        task.value.addedMediaType = entry.mediaType.type ?? null
        await processFilesForType(entry.mediaType, entry.files)
      }

      await updateProgress(true)

      const addedCount = useFastImport
        ? bulkInsertedTotal
        : task.value.added.length

      task.value.addedTotal = addedCount

      const ensuredTypeIds = [...new Set(
        typedEntries
          .map((entry) => Number(entry.mediaType.id))
          .filter((id) => Number.isFinite(id)),
      )]

      if (addedCount > 0 && ensuredTypeIds.length) {
        try {
          await ensureStarterMeta({mediaTypeIds: ensuredTypeIds})
        } catch (error) {
          console.error('Failed to ensure starter meta after adding media:', error)
        }
      }

      if (!useFastImport && addedForParsing.length > 0) {
        task.value.status = t('media.adding.adding_metadata')
        await parseTagsForAddedMedia(addedForParsing)
      }

      if (addedCount > 0) {
        if (!useFastImport) {
          await suggestTagsFromAddedFiles()
        }

        task.value.finished = true
        task.value.active = false
        task.value.media_type_id = null
        task.value.status = t('media.adding.complete')
        keepTaskAfterComplete = true

        if (keepTaskAfterComplete) {
          await tasksStore.updateTask(taskId, {
            subtitle: t('media.adding.added_count', {count: addedCount}),
            progress: 100,
            color: 'success',
            done: true,
            action: undefined,
          })
        }

        setNotification({
          type: 'success',
          title: t('media.adding.complete'),
          text: t('media.adding.added_count', {count: addedCount}),
          actions: fromInbox
            ? [
              openProcessAction(),
              {
                id: 'open-media-inbox-pending',
                text: t('media_inbox.open_pending'),
                icon: 'inbox-arrow-down',
                action: () => mediaInboxStore.open('pending'),
                hide: true,
              },
            ]
            : [openProcessAction()],
        })

        if (fromInbox) {
          const ids = (task.value.addedMedia || [])
            .map((entry) => Number(entry.mediaId))
            .filter((id) => Number.isFinite(id) && id > 0)
          if (ids.length) mediaInboxStore.enqueuePendingReview(ids)
        }

        if (shouldShowOnboarding(false)) {
          await saveOnboardingStep(ONBOARDING_STEP_COUNT - 1)
          await openMediaAddingProcess()
        }
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
        || targetTypes.some((item) => Number(item.id) === Number(ENV.value.media_type_id))
      ) {
        listSync.getItemsFromDb({
          ids: [],
          type: 'media',
        })
      }

      const resolvedWatcherPaths = [
        ...task.value.added,
        ...task.value.duplicates.map((entry) => entry.path),
      ]

      if (resolvedWatcherPaths.length > 0 && watcherStore.files.length > 0) {
        watcherStore.files = removeWatcherNewPaths(watcherStore.files, resolvedWatcherPaths)
      }

      eventBus.emit('update:watcher')
      if (addedCount > 0) {
        eventBus.emit('library:nav-counts-changed')
      }
    } catch (error) {
      console.error('Error in addMedia process:', error)
      const message = getApiErrorMessage(error, t('media.adding.error_title'))
      setNotification({
        title: t('media.adding.error_title'),
        text: message,
      })
      task.value.status = null
      task.value.errors.push(message)
    } finally {
      addMediaInProgress = false
      if (!keepTaskAfterComplete) {
        await tasksStore.removeTask(taskId)
        if (task.value.notificationTaskId === taskId) {
          task.value.notificationTaskId = null
        }
      } else {
        await tasksStore.updateTask(taskId, {
          done: true,
          action: undefined,
        })
      }

      void import('@/composable/useFreeLibraryGate').then(({useFreeLibraryGate}) => {
        void useFreeLibraryGate().refreshLibraryCount()
      })
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
            // createOne expects a flat {mediaId, tagId, metaId} body (not {data: item}).
            const response = await typedApi.createTagsInMediaOne(item)
            if (response.data?.[1]) parsedCount += 1
          }
        } else {
          try {
            await typedApi.postTagsInMedia(valsChunk)
            parsedCount += valsChunk.length
          } catch (error) {
            console.error('Error linking parsed path tags:', error)
          }
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
        listSync.getItemsFromDb({
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
        paths: task.value.added.map((filePath) => ({ path: filePath })),
        limit: 1000,
        maxWords: 3,
        excludeExisting: true,
      })

      const suggestions = response.data?.suggestions || []
      names.push(...suggestions
        .map((item) => item.word)
        .filter((word): word is string => Boolean(word))
        .slice(0, 500))
    } catch (error) {
      console.error('Error suggesting tags from added files:', error)
    }

    task.value.suggestedTags = uniqueNames(names).slice(0, 500)
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

  const scanFolderDuplicates = async (): Promise<void> => {
    if (addMediaInProgress) return
    addMediaInProgress = true

    const appStore = useAppStore()
    const t = i18n.global.t
    const mediaTypes = appStore.mediaTypes as MediaType[]
    const paths = transformTextToArray(task.value.paths)
    const excluded = transformTextToArray(task.value.excluded)
    const mediaType = resolveTargetMediaTypesForAdding(
      mediaTypes,
      task.value.media_type_ids,
    )[0] || resolveMediaTypeForAdding(mediaTypes, {
      mediaTypeId: task.value.media_type_id,
      paths,
      directFiles: task.value.directFiles || [],
      skipFileScan: Boolean(task.value.skipFileScan),
    })

    if (!mediaType || !paths.length) {
      addMediaInProgress = false
      return
    }

    task.value.status = t('media.adding.scanning_files')
    task.value.progress = 0
    task.value.duplicates = []
    task.value.errors = []
    task.value.finished = false
    task.value.stopped = false

    const abortController = new AbortController()
    // Respect the process dialog stop flag via polling abort
    const stopWatcher = setInterval(() => {
      if (task.value.stopped) {
        abortController.abort()
        clearInterval(stopWatcher)
      }
    }, 200)

    try {
      const handleEvent = (event: Record<string, unknown>) => {
        if (event.type === 'progress') {
          const processed = Number(event.processed || 0)
          const total = Number(event.total || 0)
          task.value.current = processed
          task.value.total = total
          task.value.progress = total ? Math.min((processed / total) * 100, 100) : 0
          task.value.processed = t('media.adding.in_progress', {current: processed, total})
          task.value.status = String(event.phase || t('media.adding.scanning_files'))
          if (event.current) {
            task.value.status = `${task.value.status}: ${event.current}`
          }
          scheduleDesktopChromeSync()
        }

        if (event.type === 'complete') {
          const inLibrary = Array.isArray(event.inLibrary) ? event.inLibrary as Array<{
            path: string
            libraryPath: string
            libraryId: number
            parameter: string
          }> : []
          const withinFolder = Array.isArray(event.withinFolder) ? event.withinFolder as Array<{
            paths: string[]
            filesize: number
          }> : []

          for (const item of inLibrary) {
            task.value.duplicates.push({
              path: item.path,
              duplicate: {
                parameter: item.parameter,
                path: item.libraryPath,
                id: item.libraryId,
                reason: 'duplicate',
              },
            })
          }

          for (const group of withinFolder) {
            const [first, ...rest] = group.paths || []
            for (const filePath of rest) {
              task.value.duplicates.push({
                path: filePath,
                duplicate: {
                  parameter: 'basename_filesize',
                  path: first,
                  reason: 'duplicate',
                },
              })
            }
          }

          task.value.finished = true
          task.value.progress = 100
          task.value.status = t('media.adding.duplicates_by_fingerprint_count', {
            count: task.value.duplicates.length,
          })
        }

        if (event.type === 'error') {
          throw new Error(String(event.message || 'Folder duplicate scan failed'))
        }
      }

      await typedApi.streamScanFolderDuplicates(
        {
          folders: paths,
          excluded: task.value.is_exclude ? excluded : [],
          mediaTypeId: mediaType.id,
        },
        {signal: abortController.signal},
        handleEvent,
      )
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      if (err.name !== 'AbortError') {
        task.value.errors.push(err.message)
        setNotification({
          type: 'error',
          title: t('media.adding.scan_duplicates'),
          text: err.message,
        })
      }
      task.value.finished = true
    } finally {
      clearInterval(stopWatcher)
      addMediaInProgress = false
    }
  }

  return {
    task,
    addMedia,
    scanFolderDuplicates,
    handleAddMedia,
    parseTagsForAddedMedia,
    reparseTagsForAddedMedia,
    setupEventListeners,
    cleanupEventListeners,
  }
}
