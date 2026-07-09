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

const listenerSubscriptions = new Map<IpcCallback, ListenerSubscription>()
let pendingPlayVideo: unknown = null
const playVideoListeners = new Set<PlayVideoListener>()

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

function setMediaDragHover(active: boolean) {
  if (mediaDragHoverActive === active) return
  mediaDragHoverActive = active
  for (const listener of mediaDragHoverListeners) {
    listener(active)
  }
}

function handlePreloadDragEnter(event: Event) {
  const dragEvent = event as DragEvent
  if (!isLikelyExternalFileDrag(dragEvent)) return

  event.preventDefault()
  setMediaDragHover(true)
}

function handlePreloadDragOver(event: Event) {
  const dragEvent = event as DragEvent
  if (!isLikelyExternalFileDrag(dragEvent)) return

  event.preventDefault()
  if (dragEvent.dataTransfer) {
    dragEvent.dataTransfer.dropEffect = 'copy'
  }
  setMediaDragHover(true)
}

function resetMediaDragHover() {
  setMediaDragHover(false)
}

window.addEventListener('dragenter', handlePreloadDragEnter, true)
window.addEventListener('dragover', handlePreloadDragOver, true)
window.addEventListener('drop', resetMediaDragHover, true)
window.addEventListener('dragend', resetMediaDragHover, true)

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

  // Для вызова с ожиданием ответа
  invoke: (channel: string, data: unknown) => {
    if (includesChannel(validInvokeChannels, channel)) {
      ipcLog(`[IPC] Invoking ${channel}:`, data);

      // Специальная обработка для showOpenDialog
      if (channel === 'showOpenDialog') {
        let normalized = data
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
      } else {
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
  chrome: process.versions.chrome
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
});
