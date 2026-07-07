import type { Express, Request } from 'express'

import { apiErrorMessage, apiErrorStack } from '../../api/types/errors'
import type { MoveItemInput } from './moveFile'

export type {
  MoveItemInput,
  MoveProgressHandler,
  PreparedMoveItem,
} from './moveFile'

export type WatcherExtensionsMap = Record<string, string[]>

export type WatcherWsMessage = {
  type: 'start' | 'update' | 'stop' | 'refresh'
  folders?: WatchedFolderEntry[]
  extensions?: WatcherExtensionsMap
}

export interface MoveFilesWsMessage {
  type: 'move'
  items?: MoveItemInput[]
  ids?: unknown[]
  folder?: string
}

export interface RenameFileWsMessage {
  type: 'rename'
  old_path?: string
  new_path?: string
}

export type MovingWsMessage = MoveFilesWsMessage | RenameFileWsMessage

export type WsOutboundPayload = Record<string, unknown>

export type WsHandler = (ws: AppWebSocket, req: Request) => void

export type ExpressWithWs = Express & {
  ws(route: string, handler: WsHandler): void
}

export interface WatchedMediaTypeEntry {
  id: number | string
  extensions: string
}

export interface WatchedFolderEntry {
  path: string
  types?: WatchedMediaTypeEntry[]
}

export interface WatcherFileEntry {
  path: string
  id: unknown
}

export interface WatcherFolderReport {
  folder: WatchedFolderEntry
  files: Array<{
    type: WatchedMediaTypeEntry
    lost: WatcherFileEntry[]
    new: string[]
  }>
}

export interface AppWebSocket {
  readyState: number
  send(data: string): void
  close(): void
  on(event: string, listener: (...args: unknown[]) => void | Promise<void>): void
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? apiErrorMessage(err) : String(err)
}

export function errorStack(err: unknown): string | undefined {
  return err instanceof Error ? apiErrorStack(err) : undefined
}

export function errnoCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as {code?: unknown}).code
    return typeof code === 'string' ? code : undefined
  }
  return undefined
}

export type MoveErrorLike = {
  code?: string
  required?: unknown
  available?: unknown
  message?: string
}

export function asMoveError(error: unknown): Required<Pick<MoveErrorLike, 'message'>> & MoveErrorLike {
  if (error && typeof error === 'object') {
    const record = error as MoveErrorLike
    return {
      code: record.code || errnoCode(error) || 'UNKNOWN',
      required: record.required,
      available: record.available,
      message: record.message || errorMessage(error),
    }
  }
  return { message: errorMessage(error), code: 'UNKNOWN' }
}
