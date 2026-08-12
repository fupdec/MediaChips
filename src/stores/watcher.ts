import { defineStore } from 'pinia'
import type { WatchedFolderEntry } from '@/services/watcherUtils'
import { getActiveWatchedFolders, isFolderWatchEnabled } from '@/services/watcherUtils'
import type { WatcherFilesEntry, WatcherFolderState } from '@/types/watcher'
import type { MediaType } from '@/types/media'

function buildWatcherMenuEntries(folders: WatchedFolderEntry[]): WatcherFilesEntry[] {
  return folders
    .filter((folder) => folder.id != null)
    .map((folder) => ({
      folder: {
        id: Number(folder.id),
        name: folder.name,
        path: folder.path,
        watch: isFolderWatchEnabled(folder),
        icon: folder.icon || undefined,
        excludedPaths: folder.excludedPaths || [],
      },
      files: (folder.types || []).map((type: MediaType) => ({
        type,
        new: [],
        lost: [],
      })),
    }))
}

function filterTrackedMenuEntries(
  entries: WatcherFilesEntry[],
  folders: WatchedFolderEntry[],
): WatcherFilesEntry[] {
  if (folders.length > 0) {
    const activeIds = new Set(
      getActiveWatchedFolders(folders)
        .map((folder) => Number(folder.id ?? folder.folderId))
        .filter((id) => Number.isFinite(id) && id > 0),
    )

    return entries.filter((entry) => activeIds.has(Number(entry.folder.id)))
  }

  return entries.filter((entry) => entry.folder.watch !== false)
}

export const useWatcherStore = defineStore('watcher', {
  state: () => ({
    ws: null as WebSocket | null,
    busy: false,
    folders: [] as WatchedFolderEntry[],
    files: [] as WatcherFilesEntry[],
    dialogFolder: false,
    folder: null as WatcherFolderState | null,
  }),

  getters: {
    watchedFolders: (state) => getActiveWatchedFolders(state.folders),
    menuEntries(state): WatcherFilesEntry[] {
      if (state.files.length > 0) {
        return filterTrackedMenuEntries(state.files, state.folders)
      }

      return buildWatcherMenuEntries(getActiveWatchedFolders(state.folders))
    },
  },

  actions: {},
})

export default useWatcherStore
