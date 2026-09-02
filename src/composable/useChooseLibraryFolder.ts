import { ref } from 'vue'
import { i18n } from '@/i18n/loadLocale'
import { typedApi } from '@/services/typedApi'
import { setOption } from '@/services/settingsService'
import { setNotification } from '@/services/notificationService'
import { getWatchedFolders } from '@/services/watcherService'
import { reloadMediaTypesCatalog } from '@/composable/appCatalogs'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { useTasksStore } from '@/stores/tasks'
import { useWatcherStore } from '@/stores/watcher'
import { useEventBus } from '@/utils/eventBus'
import {
  bucketFilesByMediaType,
  getManagedMediaTypesIncludingHidden,
} from '@/utils/mediaType'
import type { MediaType } from '@/types/media'

const chooseLibraryFolderDialogOpen = ref(false)

function folderDisplayName(folderPath: string): string {
  const parts = String(folderPath || '').split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] || folderPath
}

/** All managed media types (video/image/audio/text), including hidden. */
export function getAllManagedMediaTypes(mediaTypes: MediaType[] | null | undefined): MediaType[] {
  return getManagedMediaTypesIncludingHidden(mediaTypes)
}

export function useChooseLibraryFolderDialog() {
  return {
    open: chooseLibraryFolderDialogOpen,
    onConfirm: handleChooseLibraryFolderConfirm,
  }
}

export async function unhideMediaTypesThatReceivedFiles(
  paths: string[],
  mediaTypes: MediaType[],
): Promise<void> {
  if (!paths.length) return

  const managed = getAllManagedMediaTypes(mediaTypes)
  const buckets = bucketFilesByMediaType(paths, managed)
  let changed = false

  for (const mediaType of managed) {
    if (!mediaType.hidden) continue
    const files = buckets.get(Number(mediaType.id)) || []
    if (!files.length) continue
    await typedApi.updateMediaType(Number(mediaType.id), {hidden: false})
    changed = true
  }

  if (changed) {
    await reloadMediaTypesCatalog()
  }
}

/**
 * After a successful folder import: enable watching and register the folder.
 * Does not roll back import on failure — shows a soft notification instead.
 */
export async function registerFolderAsWatchedAfterImport(
  folderPath: string,
  typeIds?: number[],
): Promise<boolean> {
  const path = String(folderPath || '').trim()
  if (!path) return false

  const t = i18n.global.t
  const app = useAppStore()
  const settings = useSettingsStore()
  const watcherStore = useWatcherStore()
  const eventBus = useEventBus()

  const managedIds = (typeIds?.length
    ? typeIds
    : getAllManagedMediaTypes(app.mediaTypes).map((item) => Number(item.id))
  ).filter((id) => Number.isFinite(id) && id > 0)

  try {
    if (settings.watchFolders !== '1') {
      settings.updateState({key: 'watchFolders', value: '1'})
      await setOption('1', 'watchFolders')
    }

    const {runWatchFolderRiskGate} = await import('@/composable/useWatchFolderRiskGate')
    const gate = await runWatchFolderRiskGate({path})
    if (gate.action === 'skip') {
      return false
    }

    await typedApi.createWatchedFolder({
      folder: {
        path,
        name: folderDisplayName(path),
        watch: true,
        ...(gate.excludedPaths.length ? {excludedPaths: gate.excludedPaths} : {}),
      },
      types: managedIds,
    })

    watcherStore.folders = await getWatchedFolders()
    eventBus.emit('update:watcher')
    return true
  } catch (error) {
    console.error('Failed to register watched folder after import:', error)
    setNotification({
      type: 'warning',
      title: t('empty_states.watch_folder_failed_title'),
      text: t('empty_states.watch_folder_failed_text'),
      actions: [
        {
          id: 'open-watched-folders',
          text: t('onboarding.open_watched_folders'),
          icon: 'folder-eye',
          action: () => {
            void import('@/router').then(({default: router}) => {
              void router.push({path: '/settings', query: {section: 'watched_folders'}})
            })
          },
          hide: true,
        },
      ],
    })
    return false
  }
}

function prepareMediaAddingForLibraryFolder(folderPath: string): void {
  const app = useAppStore()
  const tasksStore = useTasksStore()
  const managed = getAllManagedMediaTypes(app.mediaTypes)
  const managedIds = managed.map((item) => Number(item.id)).filter((id) => id > 0)

  tasksStore.mediaAdding.paths = folderPath
  tasksStore.mediaAdding.excluded = ''
  tasksStore.mediaAdding.media_type_ids = managedIds
  tasksStore.mediaAdding.media_type_id = managedIds.length === 1 ? managedIds[0] : null
  tasksStore.mediaAdding.watchFolderAfterImport = folderPath
  tasksStore.mediaAdding.is_parsing = true
  tasksStore.mediaAdding.is_check_duplicates = true
  tasksStore.mediaAdding.is_fast_import = true
  tasksStore.mediaAdding.fast_import_locked = false
  tasksStore.mediaAdding.is_exclude = false
  tasksStore.mediaAdding.skipFileScan = false
  tasksStore.mediaAdding.directFiles = []
  tasksStore.mediaAdding.fromInbox = false
  tasksStore.mediaAdding.dialogProcess = true
  tasksStore.mediaAdding.active = true
}

async function importLibraryFolder(folderPath: string): Promise<void> {
  const path = String(folderPath || '').trim()
  if (!path) return

  prepareMediaAddingForLibraryFolder(path)
  const {useMediaAdding} = await import('@/composable/AddingMedia')
  await useMediaAdding().addMedia()
}

export async function handleChooseLibraryFolderConfirm(paths: string[]): Promise<void> {
  const folderPath = paths.map((entry) => String(entry || '').trim()).find(Boolean)
  if (!folderPath) return

  chooseLibraryFolderDialogOpen.value = false
  await importLibraryFolder(folderPath)
}

/**
 * Primary empty-library CTA: built-in folder browser → import → watch.
 */
export async function chooseLibraryFolderAndImport(): Promise<void> {
  const {useFreeLibraryGate} = await import('@/composable/useFreeLibraryGate')
  if (!(await useFreeLibraryGate().ensureCanImportMedia())) return

  chooseLibraryFolderDialogOpen.value = true
}
