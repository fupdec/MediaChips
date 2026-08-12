import type { IpcRendererEvent } from 'electron'
import {
  contextBridge,
  ipcRenderer,
  webUtils,
} from 'electron'
import os from 'os'
import type { IpcCallback, IpcListener, ListenerSubscription } from './types/ipc'
import {
  IPC_INVOKE_CHANNELS,
  IPC_ON_CHANNELS,
  IPC_SEND_CHANNELS,
} from '../shared/electron/ipc'
import { isLikelyExternalFileDrag } from '../shared/mediaFileDrag'

const validSendChannels = [...IPC_SEND_CHANNELS]

const validInvokeChannels = [...IPC_INVOKE_CHANNELS]

const validOnChannels = [...IPC_ON_CHANNELS]

const payloadObjectChannels = new Set([
  'getItemsFromDb',
  'removeEntitiesFromState',
])

function includesChannel(channels: readonly string[], channel: string): boolean {
  return channels.includes(channel)
}

type PlayVideoListener = (event: IpcRendererEvent | null, data: unknown) => void
type MenuActionListener = (action: string) => void

const listenerSubscriptions = new Map<IpcCallback, ListenerSubscription>()
let pendingPlayVideo: unknown = null
const playVideoListeners = new Set<PlayVideoListener>()
let pendingMenuAction: string | null = null
const menuActionListeners = new Set<MenuActionListener>()

ipcRenderer.on('play-video', (event: IpcRendererEvent, ...args: unknown[]) => {
  const data = args.length > 0 ? args[0] : null;
  if (playVideoListeners.size === 0) {
    pendingPlayVideo = data;
    return;
  }

  for (const callback of playVideoListeners) {
    callback(event, data);
  }
});

ipcRenderer.on('menuAction', (_event: IpcRendererEvent, ...args: unknown[]) => {
  const action = String(args[0] ?? '')
  if (!action) return
  if (menuActionListeners.size === 0) {
    pendingMenuAction = action
    return
  }
  for (const callback of menuActionListeners) {
    callback(action)
  }
})

type FileLike = { path?: string }

const isDevPreload = process.env.NODE_ENV !== 'production'

function ipcLog(...args: unknown[]): void {
  if (isDevPreload) console.log(...args)
}

function ipcWarn(...args: unknown[]): void {
  if (isDevPreload) console.warn(...args)
}

type MediaDragHoverListener = (active: boolean) => void
const mediaDragHoverListeners = new Set<MediaDragHoverListener>()
let mediaDragHoverActive = false
/** True while native card drag-out is in progress — do not show drop-in UI. */
let mediaDragOutboundActive = false
let clearOutboundTimer: ReturnType<typeof setTimeout> | null = null
/** Clears hover if dragover stops (cursor left the window / drag cancelled). */
let mediaDragHoverStaleTimer: ReturnType<typeof setTimeout> | null = null
const isDarwin = process.platform === 'darwin'

function setMediaDragHover(active: boolean, options?: {forceNotify?: boolean}) {
  if (mediaDragHoverActive === active && !options?.forceNotify) return
  mediaDragHoverActive = active
  for (const listener of mediaDragHoverListeners) {
    listener(active)
  }
}

function clearMediaDragHoverStaleTimer() {
  if (mediaDragHoverStaleTimer) {
    clearTimeout(mediaDragHoverStaleTimer)
    mediaDragHoverStaleTimer = null
  }
}

function scheduleMediaDragHoverStaleReset() {
  clearMediaDragHoverStaleTimer()
  mediaDragHoverStaleTimer = setTimeout(() => {
    mediaDragHoverStaleTimer = null
    resetMediaDragHover()
  }, 200)
}

function isDragLeavingWindow(event: DragEvent): boolean {
  const next = event.relatedTarget
  if (next instanceof Node && document.documentElement.contains(next)) {
    return false
  }
  const {clientX, clientY} = event
  return (
    clientX <= 0
    || clientY <= 0
    || clientX >= window.innerWidth
    || clientY >= window.innerHeight
  )
}

function clearMediaDragOutbound() {
  if (clearOutboundTimer) {
    clearTimeout(clearOutboundTimer)
    clearOutboundTimer = null
  }
  mediaDragOutboundActive = false
  resetMediaDragHover()
}

function beginMediaDragOutbound() {
  if (clearOutboundTimer) {
    clearTimeout(clearOutboundTimer)
    clearOutboundTimer = null
  }
  mediaDragOutboundActive = true
  resetMediaDragHover()
}

/**
 * On macOS startDrag returns immediately while the OS drag continues.
 * Keep suppression until mouseup/drop/dragend (NOT blur — hovering Finder
 * blurs the window mid-drag and would re-enable the drop-in overlay).
 * On Windows/Linux startDrag blocks until the drag ends — clear soon after.
 */
function finishMediaDragOutboundAfterStartDrag() {
  resetMediaDragHover()
  if (isDarwin) {
    mediaDragOutboundActive = true
    if (clearOutboundTimer) clearTimeout(clearOutboundTimer)
    clearOutboundTimer = setTimeout(() => {
      clearOutboundTimer = null
      clearMediaDragOutbound()
    }, 120_000)
    return
  }

  if (clearOutboundTimer) clearTimeout(clearOutboundTimer)
  clearOutboundTimer = setTimeout(() => {
    clearOutboundTimer = null
    clearMediaDragOutbound()
  }, 150)
}

function handlePreloadDragEnter(event: Event) {
  if (mediaDragOutboundActive) {
    event.preventDefault()
    resetMediaDragHover()
    return
  }

  const dragEvent = event as DragEvent
  if (!isLikelyExternalFileDrag(dragEvent)) return

  event.preventDefault()
  setMediaDragHover(true, {forceNotify: true})
  scheduleMediaDragHoverStaleReset()
}

function handlePreloadDragOver(event: Event) {
  if (mediaDragOutboundActive) {
    event.preventDefault()
    if ((event as DragEvent).dataTransfer) {
      ;(event as DragEvent).dataTransfer!.dropEffect = 'none'
    }
    resetMediaDragHover()
    return
  }

  const dragEvent = event as DragEvent
  if (!isLikelyExternalFileDrag(dragEvent)) return

  event.preventDefault()
  if (dragEvent.dataTransfer) {
    dragEvent.dataTransfer.dropEffect = 'copy'
  }
  setMediaDragHover(true)
  scheduleMediaDragHoverStaleReset()
}

function handlePreloadDragLeave(event: Event) {
  if (mediaDragOutboundActive) {
    resetMediaDragHover()
    return
  }

  const dragEvent = event as DragEvent
  if (!isLikelyExternalFileDrag(dragEvent)) return
  if (isDragLeavingWindow(dragEvent)) {
    resetMediaDragHover()
  }
}

function resetMediaDragHover() {
  clearMediaDragHoverStaleTimer()
  setMediaDragHover(false)
}

function handleOutboundDragEnded() {
  if (mediaDragOutboundActive) clearMediaDragOutbound()
}

function handlePreloadDropOrDragEnd(event?: Event) {
  if (event?.type === 'drop') {
    captureDroppedFilePaths(event as DragEvent)
  }
  resetMediaDragHover()
  handleOutboundDragEnded()
}

function captureDroppedFilePaths(event: DragEvent) {
  const files = Array.from(event.dataTransfer?.files || [])
  if (!files.length) {
    for (const item of Array.from(event.dataTransfer?.items || [])) {
      if (item.kind !== 'file') continue
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }

  const paths: string[] = []
  for (const file of files) {
    try {
      const next = webUtils.getPathForFile(file as File)
      if (next) paths.push(next)
    } catch {
      const fallback = (file as File & {path?: string}).path
      if (fallback) paths.push(fallback)
    }
  }

  if (paths.length) {
    lastDroppedFilePaths = paths
    lastDroppedFilePathsAt = Date.now()
  }
}

/** Paths captured in preload on the last file drop (more reliable than bridging File). */
let lastDroppedFilePaths: string[] = []
let lastDroppedFilePathsAt = 0
const DROPPED_PATHS_TTL_MS = 5_000

function takeLastDroppedFilePaths(): string[] {
  if (!lastDroppedFilePaths.length) return []
  if (Date.now() - lastDroppedFilePathsAt > DROPPED_PATHS_TTL_MS) {
    lastDroppedFilePaths = []
    return []
  }
  const paths = lastDroppedFilePaths
  lastDroppedFilePaths = []
  lastDroppedFilePathsAt = 0
  return paths
}

window.addEventListener('dragenter', handlePreloadDragEnter, true)
window.addEventListener('dragover', handlePreloadDragOver, true)
window.addEventListener('dragleave', handlePreloadDragLeave, true)
window.addEventListener('drop', handlePreloadDropOrDragEnd, true)
window.addEventListener('dragend', handlePreloadDropOrDragEnd, true)
window.addEventListener('mouseup', handleOutboundDragEnded, true)
// After a drop outside the app, the next click inside clears outbound suppression.
window.addEventListener('mousedown', handleOutboundDragEnded, true)

// Экспортируем API с разными пространствами имен
contextBridge.exposeInMainWorld('electronAPI', {
  // Для отправки сообщений
  send: (channel: string, data: unknown) => {
    if (includesChannel(validSendChannels, channel)) {
      ipcLog(`[IPC] Sending to ${channel}:`, data);
      ipcRenderer.send(channel, data);
    } else {
      ipcWarn(`[IPC] Blocked attempt to send to channel: ${channel}`);
    }
  },

  getPathForFile: (file: FileLike | null | undefined) => {
    if (!file) return ''

    try {
      return webUtils.getPathForFile(file as File)
    } catch (error) {
      ipcWarn('[IPC] getPathForFile failed:', error)
      return file.path || ''
    }
  },

  /** Consume paths captured by the preload drop listener (preferred over bridging File). */
  takeDroppedFilePaths: () => takeLastDroppedFilePaths(),

  // Для вызова с ожиданием ответа
  invoke: (channel: string, data: unknown) => {
    if (includesChannel(validInvokeChannels, channel)) {
      ipcLog(`[IPC] Invoking ${channel}:`, data);

      // Специальная обработка для showOpenDialog
      if (channel === 'showOpenDialog') {
        let normalized = data
        // Allow { properties, filters } for zip file picks.
        if (
          normalized
          && typeof normalized === 'object'
          && !Array.isArray(normalized)
          && 'properties' in (normalized as Record<string, unknown>)
        ) {
          return ipcRenderer.invoke(channel, normalized);
        }
        // Убеждаемся, что передаем массив
        if (!Array.isArray(normalized)) {
          ipcWarn('[IPC] showOpenDialog: data должен быть массивом, преобразую...');
          if (typeof normalized === 'string') {
            normalized = [normalized];
          } else if (typeof normalized === 'object' && normalized !== null) {
            normalized = Object.keys(normalized as Record<string, unknown>).filter(
              key => (normalized as Record<string, unknown>)[key] === true,
            );
          } else {
            normalized = [];
          }
        }
        return ipcRenderer.invoke(channel, normalized);
      }

      return ipcRenderer.invoke(channel, data);
    }
    ipcWarn(`[IPC] Blocked attempt to invoke channel: ${channel}`);
    return Promise.reject(new Error(`Channel ${channel} is not allowed`));
  },

  // Для получения сообщений
  on: (channel: string, callback: IpcCallback) => {
    if (includesChannel(validOnChannels, channel)) {
      ipcLog(`[IPC] Setting up listener for ${channel}`);

      // Создаем специальный обработчик для play-video
      if (channel === 'play-video') {
        const subscription: PlayVideoListener = (event, data) => {
          callback(event, data);
        };
        playVideoListeners.add(subscription);
        listenerSubscriptions.set(callback, {channel, subscription, isPlayVideo: true});

        if (pendingPlayVideo !== null) {
          const buffered = pendingPlayVideo;
          pendingPlayVideo = null;
          callback(null, buffered);
        }

        return () => {
          playVideoListeners.delete(subscription);
          listenerSubscriptions.delete(callback);
        };
      }

      if (channel === 'menuAction') {
        const subscription: MenuActionListener = (action) => {
          callback(action)
        }
        menuActionListeners.add(subscription)
        listenerSubscriptions.set(callback, {channel, subscription: subscription as never, isMenuAction: true})

        if (pendingMenuAction !== null) {
          const buffered = pendingMenuAction
          pendingMenuAction = null
          callback(buffered)
        }

        return () => {
          menuActionListeners.delete(subscription)
          listenerSubscriptions.delete(callback)
        }
      }

      {
        // Для остальных каналов передаем как есть
        const subscription: IpcListener = (event, ...args) => {
          if (payloadObjectChannels.has(channel)) {
            const payload = args[0]
            if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
              ipcWarn(`[IPC] Ignoring ${channel} with invalid payload:`, args)
              return
            }
          }

          ipcLog(`[IPC] Received from ${channel}:`, args);
          callback(...args);
        };
        ipcRenderer.on(channel, subscription);
        listenerSubscriptions.set(callback, {channel, subscription});

        return () => {
          ipcRenderer.removeListener(channel, subscription);
          listenerSubscriptions.delete(callback);
        };
      }
    }
    ipcWarn(`[IPC] Blocked attempt to listen to channel: ${channel}`);
    return () => {};
  },

  removeListener: (channel: string, callback: IpcCallback) => {
    const entry = listenerSubscriptions.get(callback);
    if (entry && entry.channel === channel) {
      if (entry.isPlayVideo) {
        playVideoListeners.delete(entry.subscription as PlayVideoListener);
      } else if (entry.isMenuAction) {
        menuActionListeners.delete(entry.subscription as unknown as MenuActionListener)
      } else {
        ipcRenderer.removeListener(channel, entry.subscription as IpcListener);
      }
      listenerSubscriptions.delete(callback);
    }
  },

  // Для получения одного сообщения
  once: (channel: string, callback: IpcCallback) => {
    if (includesChannel(validOnChannels, channel)) {
      // Специальная обработка для play-video
      if (channel === 'play-video') {
        ipcRenderer.once(channel, (event: IpcRendererEvent, ...args: unknown[]) => {
          callback(event, args.length > 0 ? args[0] : null);
        });
      } else {
        ipcRenderer.once(channel, (event: IpcRendererEvent, ...args: unknown[]) => callback(...args));
      }
    }
  },

  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    getState: () => ipcRenderer.invoke('updater:get-state'),
    isSupported: () => ipcRenderer.invoke('updater:is-supported'),
    onStatus: (callback: (payload: unknown) => void) => {
      const subscription = (_event: IpcRendererEvent, payload: unknown) => callback(payload)
      ipcRenderer.on('updater:status', subscription)
      return () => ipcRenderer.removeListener('updater:status', subscription)
    },
  },
});

// Экспортируем утилиты как отдельные глобальные объекты
contextBridge.exposeInMainWorld('operableAPI', {
  openPath: (path: string) => ipcRenderer.invoke('openPath', path),
  checkFileExists: (path: string) => ipcRenderer.invoke('checkFileExists', path),
  deleteLocalFile: (path: string) => ipcRenderer.invoke('deleteLocalFile', path),
  createThumb: (time: number, videoPath: string, imgPath: string, width: number) =>
    ipcRenderer.invoke('createThumb', { time, videoPath, imgPath, width }),
  setNotification: (notification: unknown) => ipcRenderer.invoke('setNotification', notification)
});

contextBridge.exposeInMainWorld('readableAPI', {
  getDateForDB: () => ipcRenderer.invoke('getDateForDB')
});

// Экспортируем безопасные свойства OS
contextBridge.exposeInMainWorld('osAPI', {
  platform: os.platform(),
  homedir: os.homedir(),
  tmpdir: os.tmpdir(),
  arch: os.arch(),
  type: os.type(),
  version: os.version()
});

// Экспортируем версию
contextBridge.exposeInMainWorld('appInfo', {
  version: process.versions.electron,
  node: process.versions.node,
  chrome: process.versions.chrome,
  // Runtime env (not baked by esbuild) — preview Windows SystemBar on macOS/Linux.
  forceWinUi: process.env.MEDIA_CHIPS_WIN_UI === '1',
});

// Для обратной совместимости с существующим кодом
contextBridge.exposeInMainWorld('os', {
  type: () => os.type(),
  platform: () => os.platform(),
  homedir: () => os.homedir()
});

type OpenPathPayload = string | { path: string; wait?: boolean }
type CheckFilePayload = string | { path: string; skipDir?: boolean }

// Единый API для удобства (если $operable уже определен плагином, это не перезапишет его)
contextBridge.exposeInMainWorld('$electronOperable', {
  openPath: (path: OpenPathPayload, wait = false) => {
    if (typeof path === 'string') {
      return ipcRenderer.invoke('openPath', { path, wait });
    }
    return ipcRenderer.invoke('openPath', path);
  },
  checkFileExists: (path: CheckFilePayload, skipDir = false) => {
    if (typeof path === 'string') {
      return ipcRenderer.invoke('checkFileExists', { path, skipDir });
    }
    return ipcRenderer.invoke('checkFileExists', path);
  },
  deleteLocalFile: (path: string) => ipcRenderer.invoke('deleteLocalFile', path),
  createThumb: (time: number, videoPath: string, imgPath: string, width: number) =>
    ipcRenderer.invoke('createThumb', { time, videoPath, imgPath, width }),
  setNotification: (notification: unknown) => ipcRenderer.invoke('setNotification', notification),
  showOpenDialog: (properties: string[] | string | Record<string, unknown> | null | undefined) => {
    if (
      properties
      && typeof properties === 'object'
      && !Array.isArray(properties)
      && 'properties' in properties
    ) {
      return ipcRenderer.invoke('showOpenDialog', properties);
    }
    let normalized = properties
    // Убеждаемся, что передаем массив
    if (!Array.isArray(normalized)) {
      ipcWarn('[IPC] showOpenDialog: преобразую свойства в массив...');
      if (typeof normalized === 'string') {
        normalized = [normalized];
      } else if (typeof normalized === 'object' && normalized !== null) {
        const record = normalized as Record<string, unknown>
        normalized = Object.keys(record).filter(key => record[key] === true);
      } else {
        normalized = ['openDirectory'];
      }
    }
    return ipcRenderer.invoke('showOpenDialog', normalized);
  },
  getDateForDB: () => ipcRenderer.invoke('getDateForDB')
});

contextBridge.exposeInMainWorld('mediaDragAPI', {
  onHoverChange(listener: MediaDragHoverListener) {
    mediaDragHoverListeners.add(listener)
    listener(mediaDragHoverActive)
    return () => {
      mediaDragHoverListeners.delete(listener)
    }
  },
  resetHover() {
    resetMediaDragHover()
  },
  beginOutboundDrag() {
    beginMediaDragOutbound()
  },
  endOutboundDrag() {
    clearMediaDragOutbound()
  },
  isOutboundDrag() {
    return mediaDragOutboundActive
  },
  readLocalDataUrl(filePath: string) {
    if (typeof filePath !== 'string' || !filePath) return null
    const result = ipcRenderer.sendSync('media-drag:read-data-url', filePath)
    return typeof result === 'string' ? result : null
  },
  // Fire-and-forget: main builds the card icon (sharp) then calls startDrag.
  // Matches Electron's official drag-out example (send, not sendSync).
  startDrag(payload: string | { path: string; iconDataUrl?: string; thumbPath?: string; title?: string; count?: number } | { paths: string[]; iconDataUrl?: string; thumbPath?: string; title?: string; count?: number }) {
    beginMediaDragOutbound()
    ipcRenderer.send('media-drag:start', payload)
    finishMediaDragOutboundAfterStartDrag()
  },
});
