import type { MediaType } from '@/types/media'

export interface WatcherFolderInfo {
  id: number
  name?: string
  path?: string
  watch?: boolean
  [key: string]: unknown
}

export interface WatcherFileChangeGroup {
  type: MediaType
  new: string[]
  lost: Array<{ id: number; path: string; [key: string]: unknown }>
}

export interface WatcherFilesEntry {
  folder: WatcherFolderInfo
  files: WatcherFileChangeGroup[]
}

export type WatcherFolderState = WatcherFilesEntry

export interface WatcherScanStartMessage {
  type: 'scanStart'
  data: {
    folderCount: number
    folderNames: string[]
  }
}

export interface WatcherScanCompleteMessage {
  type: 'scanComplete'
  data: {
    folderCount: number
    newCount: number
    lostCount: number
    folders: Array<{
      name?: string
      path: string
      newCount: number
      lostCount: number
    }>
    failed?: boolean
    error?: string
  }
}

export interface WatcherWsInboundMessage {
  type: string
  data?: unknown
}

export function isWatcherFilesMessage(
  message: WatcherWsInboundMessage,
): message is WatcherWsInboundMessage & { type: 'files'; data: WatcherFilesEntry[] } {
  return message.type === 'files' && Array.isArray(message.data)
}

export function isWatcherScanStartMessage(
  message: WatcherWsInboundMessage,
): message is WatcherScanStartMessage {
  return message.type === 'scanStart'
    && !!message.data
    && typeof message.data === 'object'
    && typeof (message.data as WatcherScanStartMessage['data']).folderCount === 'number'
}

export function isWatcherScanCompleteMessage(
  message: WatcherWsInboundMessage,
): message is WatcherScanCompleteMessage {
  return message.type === 'scanComplete'
    && !!message.data
    && typeof message.data === 'object'
    && typeof (message.data as WatcherScanCompleteMessage['data']).folderCount === 'number'
}

export function parseWatcherInboundMessage(raw: unknown): WatcherWsInboundMessage {
  if (!raw || typeof raw !== 'object') {
    return { type: 'unknown' }
  }

  const message = raw as WatcherWsInboundMessage
  return {
    type: typeof message.type === 'string' ? message.type : 'unknown',
    data: message.data,
  }
}
