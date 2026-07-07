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
import chokidar from 'chokidar'
import { WatcherSyncEngine } from './watcherSync'
import { buildChokidarOptions, needsPollingForFolders } from './watcherChokidarOptions'
import {
  buildWatcherWatchPaths,
  foldersConfigUnchanged,
  getWatcherFoldersConfigKey,
} from './wsHelpers'
import { buildWatcherScanSummary } from './watcherScanSummary'

const FILE_EVENT_DEBOUNCE_MS = 200

export function createWatcherWsHandler(db: ApiDb): WsHandler {
  return (ws: AppWebSocket, _req: Request) => {
    let watcher: ReturnType<typeof chokidar.watch> | null = null
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
        sendReports()
      } catch (error: unknown) {
        scanFailed = true
        scanError = errorMessage(error)
        console.error('Error in watcher full sync:', errorMessage(error))
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
        syncEngine.setFolders(watchedFolders)
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
      if (watcher) {
        watcher.close()
        watcher = null
      }

      const folderPaths = folders.map((folder) => folder.path)
      const usePolling = needsPollingForFolders(folderPaths)
      const watchPaths = buildWatcherWatchPaths(extensions, usePolling)

      syncEngine.setFolders(folders)
      void syncEngine.refreshDbPaths().then(() => {
        sendReports()
      })

      watcher = chokidar.watch(
        watchPaths,
        buildChokidarOptions(folderPaths),
      )

      watcher
        .on('add', (filePath: string) => {
          queueFileEvent('add', filePath)
        })
        .on('unlink', (filePath: string) => {
          queueFileEvent('unlink', filePath)
        })
        .on('ready', async () => {
          await runFullSync()
        })
        .on('error', (error: unknown) => {
          console.error('Watcher error:', error)
        })
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

      if (watcher) {
        const folderPaths = folders.map((folder) => folder.path)
        const usePolling = needsPollingForFolders(folderPaths)
        const watchPaths = buildWatcherWatchPaths(extensions, usePolling)
        watcher.add(watchPaths)

        setTimeout(() => {
          void runFullSync()
        }, 1000)
      } else {
        startWatcher(folders, extensions)
      }
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

          case 'stop':
            if (watcher) {
              watcher.close()
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
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
      if (watcher) {
        watcher.close()
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
