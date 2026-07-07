import { watch, ref, onBeforeUnmount } from 'vue'
import { i18n } from '@/i18n/loadLocale'
import { useSettingsStore } from '@/stores/settings'
import { useWatcherStore } from '@/stores/watcher'
import {
  getActiveWatchedFolders,
  getWatchedFoldersExtensions,
  type WatchedFolderEntry,
} from '@/services/watcherUtils'
import type { WatcherWsPayload } from '@/types/itemsPage'
import {
  isWatcherFilesMessage,
  isWatcherScanCompleteMessage,
  isWatcherScanStartMessage,
  parseWatcherInboundMessage,
} from '@/types/watcher'
import {
  showWatcherScanCompleteNotification,
  showWatcherScanStartNotification,
} from '@/utils/watcherScanNotifications'
import uniqBy from 'lodash/uniqBy'

export function useWatcher(apiUrl: string) {
  const settingsStore = useSettingsStore()
  const watcherStore = useWatcherStore()
  const t = i18n.global.t

  const isWsReady = ref(false)
  const wsRetryCount = ref(0)
  const maxRetries = 3
  let scanStartNotificationId: number | null = null
  let watcherEventsEnabled = false
  let pendingStartFolders: WatchedFolderEntry[] | null = null

  const enableWatcherEvents = (): void => {
    watcherEventsEnabled = true
  }

  const getWebSocketState = (): number | null => watcherStore.ws?.readyState ?? null

  const runWatcher = (): void => {
    if (settingsStore.watchFolders !== '1') {
      return
    }

    const wsState = getWebSocketState()
    if (wsState === WebSocket.CONNECTING || wsState === WebSocket.OPEN) {
      return
    }

    if (watcherStore.ws) {
      watcherStore.ws.close()
      watcherStore.ws = null
      isWsReady.value = false
    }

    try {
      watcherStore.ws = new WebSocket(
        apiUrl.replace('http', 'ws') + '/watcher'
      )

      watcherStore.ws.onopen = () => {
        console.log('WebSocket connected')
        isWsReady.value = true
        wsRetryCount.value = 0

        const watchedFolders = pendingStartFolders ?? getActiveWatchedFolders(watcherStore.folders)
        pendingStartFolders = null
        const extensions = getWatchedFoldersExtensions(watchedFolders)

        if (watchedFolders.length > 0) {
          sendMessage({
            type: 'start',
            folders: watchedFolders,
            extensions: extensions,
          })
        } else {
          sendMessage({
            type: 'start',
            folders: [],
            extensions: {},
          })
        }
      }

      watcherStore.ws.onmessage = (msg: MessageEvent<string>) => {
        watcherStore.busy = false
        try {
          const parsedMsg = parseWatcherInboundMessage(JSON.parse(msg.data))
          console.log('WebSocket message received:', parsedMsg.type)

          switch (parsedMsg.type) {
            case 'files':
              if (isWatcherFilesMessage(parsedMsg)) {
                watcherStore.files = uniqBy(parsedMsg.data, (entry) => entry.folder.id)
              }
              break
            case 'scanStart':
              if (isWatcherScanStartMessage(parsedMsg)) {
                scanStartNotificationId = showWatcherScanStartNotification(t, parsedMsg.data)
              }
              break
            case 'scanComplete':
              if (isWatcherScanCompleteMessage(parsedMsg)) {
                showWatcherScanCompleteNotification(t, parsedMsg.data, scanStartNotificationId)
                scanStartNotificationId = null
              }
              break
            case 'closed':
              console.log('WebSocket closed by server')
              if (watcherStore.ws) {
                watcherStore.ws.close()
              }
              watcherStore.ws = null
              isWsReady.value = false
              break
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      }

      watcherStore.ws.onerror = (error: Event) => {
        console.error('WebSocket error:', error)
        watcherStore.busy = false
        isWsReady.value = false
      }

      watcherStore.ws.onclose = (event: CloseEvent) => {
        console.log('WebSocket closed', event.code, event.reason)
        watcherStore.ws = null
        watcherStore.busy = false
        isWsReady.value = false

        if (event.code !== 1000 && settingsStore.watchFolders === '1' && wsRetryCount.value < maxRetries) {
          wsRetryCount.value++
          console.log(`Retrying connection (${wsRetryCount.value}/${maxRetries})...`)
          setTimeout(() => {
            runWatcher()
          }, 1000 * wsRetryCount.value)
        }
      }
    } catch (error) {
      console.error('Error creating WebSocket:', error)
      watcherStore.ws = null
      isWsReady.value = false
    }
  }

  const updateWatcher = (foldersToWatch: WatchedFolderEntry[]): void => {
    if (settingsStore.watchFolders !== '1') return

    const wsState = getWebSocketState()

    if (wsState !== WebSocket.OPEN || !isWsReady.value || !watcherStore.ws) {
      pendingStartFolders = foldersToWatch
      runWatcher()
      return
    }

    pendingStartFolders = null
    const extensions = getWatchedFoldersExtensions(foldersToWatch)
    sendMessage({
      type: 'update',
      folders: foldersToWatch,
      extensions: extensions,
    })
  }

  const refreshWatcher = (): void => {
    if (settingsStore.watchFolders !== '1') {
      return
    }

    const wsState = getWebSocketState()
    if (wsState === WebSocket.OPEN && watcherStore.ws) {
      sendMessage({type: 'refresh'})
      return
    }

    startWatcherIfEnabled()
  }

  const startWatcherIfEnabled = (): void => {
    const watched = getActiveWatchedFolders(watcherStore.folders)
    if (watched.length > 0) {
      updateWatcher(watched)
    }
  }

  const stopWatcher = (): void => {
    if (!watcherStore.ws || watcherStore.ws.readyState !== WebSocket.OPEN) {
      console.log('WebSocket not open, cannot send stop message')
      return
    }

    sendMessage({
      type: 'stop',
    })
  }

  const sendMessage = (data: WatcherWsPayload): void => {
    if (!watcherStore.ws || watcherStore.ws.readyState !== WebSocket.OPEN) {
      console.error('Cannot send message: WebSocket not connected')
      watcherStore.busy = false
      return
    }

    try {
      watcherStore.busy = true
      const stringData = JSON.stringify(data)
      console.log('Sending WebSocket message:', data.type)
      watcherStore.ws.send(stringData)
    } catch (error) {
      console.error('Error sending WebSocket message:', error)
      watcherStore.busy = false
    }
  }

  let watchTimeout: ReturnType<typeof setTimeout> | undefined
  let foldersWatchTimeout: ReturnType<typeof setTimeout> | undefined

  watch(() => settingsStore.watchFolders, (val) => {
    if (!watcherEventsEnabled) {
      return
    }

    clearTimeout(watchTimeout)
    watchTimeout = setTimeout(() => {
      if (val === '0') {
        stopWatcher()
      } else if (val === '1') {
        runWatcher()
      }
    }, 100)
  })

  watch(() => watcherStore.folders, (val) => {
    if (!watcherEventsEnabled) {
      return
    }

    clearTimeout(foldersWatchTimeout)
    foldersWatchTimeout = setTimeout(() => {
      const watched = getActiveWatchedFolders(val)
      if (watched.length > 0) {
        updateWatcher(watched)
      }
    }, 300)
  }, { deep: true })

  onBeforeUnmount(() => {
    if (watcherStore.ws) {
      watcherStore.ws.close()
      watcherStore.ws = null
    }
    clearTimeout(watchTimeout)
    clearTimeout(foldersWatchTimeout)
  })

  return {
    runWatcher,
    updateWatcher,
    refreshWatcher,
    stopWatcher,
    enableWatcherEvents,
  }
}
