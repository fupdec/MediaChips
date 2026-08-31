import type { ApiDb } from '../../api/types/db'
import type {
  AppWebSocket,
  ExpressWithWs,
  WatchedFolderEntry,
  WatcherExtensionsMap,
  WatcherWsMessage,
  WsHandler,
} from '../types/websockets'
import { errorMessage } from '../types/websockets'
import type { Request } from 'express'
import { WatcherSyncEngine } from './watcherSync'
import { collectExcludedWatchPaths } from './watcherOptions'
import { watchFolders, type ParcelFolderWatcher } from './parcelFolderWatcher'
import {
  foldersConfigUnchanged,
  getWatcherFoldersConfigKey,
} from './wsHelpers'
import { buildWatcherScanSummary } from './watcherScanSummary'

const FILE_EVENT_DEBOUNCE_MS = 200

export function createWatcherWsHandler(db: ApiDb): WsHandler {
  return (ws: AppWebSocket, _req: Request) => {
    let watcher: ParcelFolderWatcher | null = null
    let watchedFolders: WatchedFolderEntry[] = []
    const syncEngine = new WatcherSyncEngine(db)

    let isProcessing = false
    let pendingFullSync = false
    let pendingDbRefresh = false
    let pendingFileEvents: Array<{ event: 'add' | 'unlink'; path: string }> = []
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    let lastFoldersConfigKey = ''
    let scanNotificationActive = false
    let scanFailed = false
    let scanError: string | undefined
    let startGeneration = 0

    const sendReports = () => {
      if (ws.readyState !== 1) {
        return
      }

      ws.send(JSON.stringify({
        type: 'files',
        data: syncEngine.getReports(),
      }))
    }

    const sendScanStart = () => {
      if (ws.readyState !== 1 || !watchedFolders.length) {
        return
      }

      ws.send(JSON.stringify({
        type: 'scanStart',
        data: {
          folderCount: watchedFolders.length,
          folderNames: watchedFolders.map((folder) => {
            const name = (folder as {name?: string}).name
            if (typeof name === 'string' && name.trim()) {
              return name.trim()
            }

            const normalized = folder.path.replace(/\\/g, '/').replace(/\/+$/, '')
            const parts = normalized.split('/')
            return parts[parts.length - 1] || folder.path
          }),
        },
      }))
    }

    const sendScanComplete = (options: {failed?: boolean; error?: string} = {}) => {
      if (ws.readyState !== 1) {
        return
      }

      const reports = syncEngine.getReports()
      ws.send(JSON.stringify({
        type: 'scanComplete',
        data: {
          ...buildWatcherScanSummary(reports),
          failed: options.failed === true,
          error: options.error,
        },
      }))
    }

    const processPendingFileEvents = () => {
      if (!pendingFileEvents.length) {
        return false
      }

      const queuedEvents = pendingFileEvents
      pendingFileEvents = []

      let changed = false
      for (const fileEvent of queuedEvents) {
        changed = syncEngine.applyFileEvent(fileEvent.event, fileEvent.path) || changed
      }

      return changed
    }

    const runFullSync = async () => {
      if (!watcher) {
        return
      }

      if (isProcessing) {
        pendingFullSync = true
        return
      }

      isProcessing = true
      pendingFullSync = false

      if (!scanNotificationActive) {
        scanNotificationActive = true
        scanFailed = false
        scanError = undefined
        sendScanStart()
      }

      try {
        await syncEngine.fullSync(watchedFolders)
        // fullSync is authoritative — discard FS events queued during the walk.
        if (pendingFileEvents.length) {
          console.log(
            `[watcher] dropping ${pendingFileEvents.length} file events queued during fullSync`,
          )
          pendingFileEvents = []
        }
        sendReports()
      } catch (error: unknown) {
        scanFailed = true
        scanError = errorMessage(error)
        console.error('Error in watcher full sync:', errorMessage(error))
      } finally {
        isProcessing = false

        if (pendingFullSync) {
          pendingFullSync = false
          void runFullSync()
        } else if (pendingDbRefresh) {
          pendingDbRefresh = false
          void runDbRefresh()
        } else if (scanNotificationActive) {
          sendScanComplete({
            failed: scanFailed,
            error: scanError,
          })
          scanNotificationActive = false
          scanFailed = false
          scanError = undefined
        }
      }
    }

    const runDbRefresh = async () => {
      if (!watcher) {
        return
      }

      if (isProcessing) {
        pendingDbRefresh = true
        return
      }

      isProcessing = true

      try {
        syncEngine.syncFolderMetadata(watchedFolders)
        await syncEngine.refreshDbPaths()
        sendReports()
      } catch (error: unknown) {
        console.error('Error in watcher db refresh:', errorMessage(error))
      } finally {
        isProcessing = false

        if (processPendingFileEvents()) {
          sendReports()
        }

        if (pendingFullSync) {
          pendingFullSync = false
          void runFullSync()
        } else if (pendingDbRefresh) {
          pendingDbRefresh = false
          void runDbRefresh()
        }
      }
    }

    const queueFileEvent = (event: 'add' | 'unlink', filePath: string) => {
      pendingFileEvents.push({event, path: filePath})

      if (isProcessing) {
        return
      }

      debouncedProcessFileEvents()
    }

    const processFileEvents = () => {
      if (isProcessing) {
        return
      }

      const changed = processPendingFileEvents()
      if (changed) {
        sendReports()
      }
    }

    const debouncedProcessFileEvents = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
      debounceTimer = setTimeout(() => {
        processFileEvents()
      }, FILE_EVENT_DEBOUNCE_MS)
    }

    const startWatcher = (folders: WatchedFolderEntry[], extensions: WatcherExtensionsMap) => {
      const generation = ++startGeneration

      if (watcher) {
        void watcher.close()
        watcher = null
      }

      const folderPaths = folders.map((folder) => folder.path)
      const excludedPaths = collectExcludedWatchPaths(folders)

      syncEngine.setFolders(folders)

      void (async () => {
        try {
          const next = await watchFolders({
            folderPaths,
            extensionsByFolder: extensions || {},
            excludedPaths,
          })

          if (generation !== startGeneration) {
            await next.close()
            return
          }

          watcher = next
          watcher
            .on('add', (filePath: unknown) => {
              queueFileEvent('add', String(filePath))
            })
            .on('unlink', (filePath: unknown) => {
              queueFileEvent('unlink', String(filePath))
            })
            .on('ready', () => {
              void runFullSync()
            })
            .on('error', (error: unknown) => {
              console.error('Watcher error:', error)
            })
          watcher.notifyReady()
        } catch (error: unknown) {
          console.error('Failed to start folder watcher:', errorMessage(error))
        }
      })()
    }

    const updateWatcher = (folders: WatchedFolderEntry[], extensions: WatcherExtensionsMap) => {
      const nextConfigKey = getWatcherFoldersConfigKey(folders)
      const foldersUnchanged = foldersConfigUnchanged(lastFoldersConfigKey, folders)
      watchedFolders = folders
      lastFoldersConfigKey = nextConfigKey

      if (watcher && foldersUnchanged) {
        if (!isProcessing) {
          void runDbRefresh()
        } else {
          pendingDbRefresh = true
        }
        return
      }

      // Restart so excludes and watch roots stay in sync.
      startWatcher(folders, extensions)
    }

    ws.on('message', async (rawMsg: unknown) => {
      try {
        const data = JSON.parse(String(rawMsg)) as WatcherWsMessage

        switch (data.type) {
          case 'start':
            watchedFolders = data.folders || []
            lastFoldersConfigKey = getWatcherFoldersConfigKey(watchedFolders)
            startWatcher(watchedFolders, data.extensions || {})
            break

          case 'update':
            updateWatcher(data.folders || [], data.extensions || {})
            break

          case 'refresh':
            if (!watcher) {
              break
            }
            if (!isProcessing) {
              void runDbRefresh()
            } else {
              pendingDbRefresh = true
            }
            break

          case 'rescan':
            if (!watcher) {
              break
            }
            void runFullSync()
            break

          case 'stop':
            startGeneration += 1
            if (watcher) {
              void watcher.close()
              watcher = null
            }
            syncEngine.reset()
            pendingFileEvents = []
            lastFoldersConfigKey = ''
            scanNotificationActive = false
            scanFailed = false
            scanError = undefined
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({type: 'closed'}))
            }
            break
        }
      } catch (error: unknown) {
        console.error('Error processing WebSocket message:', error)
      }
    })

    ws.on('close', () => {
      startGeneration += 1
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
      if (watcher) {
        void watcher.close()
        watcher = null
      }
    })

    ws.on('error', (error: unknown) => {
      console.error('WebSocket error:', error)
    })
  }
}

export function registerWatcherWebSocket(wsApp: ExpressWithWs, db: ApiDb): void {
  wsApp.ws('/watcher', createWatcherWsHandler(db))
}
