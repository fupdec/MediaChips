import {runLibraryOperation} from '../../api/services/libraryMaintenance'
import type { ApiDb } from '../../api/types/db'
import type {
  AppWebSocket,
  ExpressWithWs,
  MoveFilesWsMessage,
  MovingWsMessage,
  PreparedMoveItem,
  RenameFileWsMessage,
  WsHandler,
  WsOutboundPayload,
} from '../types/websockets'
import { asMoveError, errorMessage } from '../types/websockets'
import type { Request } from 'express'
import { createMediaRepository } from '../../api/db/repositories/media'
import {
  checkBatchDiskSpace,
  checkRenameDiskSpace,
  estimateSeconds,
  moveFile,
  prepareMoveItems,
  prepareRename,
} from './moveFile'
import { normalizeMoveMessageItems } from './wsHelpers'

export function createMovingWsHandler(db: ApiDb): WsHandler {
  return (ws: AppWebSocket, _req: Request) => {
    const PROGRESS_MIN_MS = 100
    let lastProgressAt = 0
    let pendingProgress: WsOutboundPayload | null = null

    const sendNow = (payload: WsOutboundPayload) => {
      if (ws.readyState === 1) ws.send(JSON.stringify(payload))
    }

    const flushProgress = () => {
      if (!pendingProgress) return
      sendNow(pendingProgress)
      pendingProgress = null
      lastProgressAt = Date.now()
    }

    const send = (payload: WsOutboundPayload) => {
      if (payload.type === 'progress') {
        pendingProgress = payload
        if (Date.now() - lastProgressAt >= PROGRESS_MIN_MS) flushProgress()
        return
      }
      flushProgress()
      sendNow(payload)
    }

    const moveFiles = async (msg: MoveFilesWsMessage) => {
      const items = normalizeMoveMessageItems(msg)

      if (!items.length) {
        send({ type: 'close', moved: 0, failed: 0, total: 0 })
        return
      }

      const { prepared, totalBytes, bytesNeedingCopy } = await prepareMoveItems(db, items)
      const validItems = prepared.filter((item: PreparedMoveItem) => !item.error)
      const preErrors = prepared.filter((item: PreparedMoveItem) => item.error)

      const diskSpaceError = await checkBatchDiskSpace(prepared, bytesNeedingCopy)
      if (diskSpaceError) {
        send({
          type: 'init',
          total: items.length,
          totalBytes,
          estimatedSeconds: 0,
        })

        for (const item of validItems) {
          send({
            type: 'error',
            id: item.id,
            fileName: item.fileName,
            folder: item.folder,
            code: 'NO_SPACE',
            required: diskSpaceError.required,
            available: diskSpaceError.available,
          })
        }

        for (const item of preErrors) {
          send({
            type: 'error',
            id: item.id,
            fileName: item.fileName,
            folder: item.folder,
            code: item.error?.code ?? 'UNKNOWN',
          })
        }

        send({
          type: 'close',
          moved: 0,
          failed: items.length,
          total: items.length,
          totalBytes,
        })
        return
      }

      const estimatedSeconds = estimateSeconds(totalBytes, bytesNeedingCopy)
      send({
        type: 'init',
        total: items.length,
        totalBytes,
        estimatedSeconds,
        preFailed: preErrors.length,
      })

      let moved = 0
      let failed = preErrors.length
      let processed = preErrors.length
      const startedAt = Date.now()
      let bytesCopied = 0

      for (const item of preErrors) {
        send({
          type: 'error',
          id: item.id,
          fileName: item.fileName,
          folder: item.folder,
          code: item.error?.code ?? 'UNKNOWN',
        })
      }

      for (const item of validItems) {
        processed += 1

        if (item.skip) {
          bytesCopied += item.size ?? 0
          moved += 1
          send({
            type: 'success',
            id: item.id,
            fileName: item.fileName,
            folder: item.folder,
            newPath: item.newPath,
            skipped: true,
          })
          continue
        }

        const fileStartBytes = bytesCopied

        try {
          await moveFile(String(item.oldPath), String(item.newPath), (transferred: number, size: number) => {
            const currentCopied = fileStartBytes + transferred
            const elapsed = (Date.now() - startedAt) / 1000
            const speed = elapsed > 0 ? currentCopied / elapsed : 0
            const remainingBytes = Math.max(0, totalBytes - currentCopied)
            const etaSeconds = speed > 0 ? Math.ceil(remainingBytes / speed) : estimatedSeconds

            send({
              type: 'progress',
              current: processed,
              total: items.length,
              fileName: item.fileName,
              fileProgress: size > 0 ? Math.round((transferred / size) * 100) : 100,
              overallProgress: totalBytes > 0
                ? Math.round((currentCopied / totalBytes) * 100)
                : Math.round((processed / items.length) * 100),
              etaSeconds,
              transferredBytes: currentCopied,
              totalBytes,
            })
          })

          bytesCopied += item.size ?? 0

          try {
            createMediaRepository(db.drizzle).updateById(Number(item.id), {path: String(item.newPath)})
          } catch (dbError: unknown) {
            try {
              await moveFile(String(item.newPath), String(item.oldPath))
            } catch (rollbackError: unknown) {
              console.error(`Rollback failed for ${item.fileName}:`, errorMessage(rollbackError))
            }

            failed += 1
            console.error(`Error updating database for ${item.fileName}:`, errorMessage(dbError))
            send({
              type: 'error',
              id: item.id,
              fileName: item.fileName,
              folder: item.folder,
              code: 'DB_UPDATE',
              message: errorMessage(dbError),
            })
            continue
          }

          moved += 1

          send({
            type: 'success',
            id: item.id,
            fileName: item.fileName,
            folder: item.folder,
            newPath: item.newPath,
          })
        } catch (error: unknown) {
          failed += 1
          const moveError = asMoveError(error)
          console.error(`Error moving file ${item.fileName}:`, moveError.message)

          send({
            type: 'error',
            id: item.id,
            fileName: item.fileName,
            folder: item.folder,
            code: moveError.code || 'UNKNOWN',
            required: moveError.required,
            available: moveError.available,
            message: moveError.message,
          })
        }
      }

      send({
        type: 'close',
        moved,
        failed,
        total: items.length,
        totalBytes,
        elapsedSeconds: Math.ceil((Date.now() - startedAt) / 1000),
      })
    }

    const renameFileOnDisk = async (msg: RenameFileWsMessage) => {
      const oldPath = msg.old_path
      const newPath = msg.new_path

      if (!oldPath || !newPath) {
        send({ type: 'close', moved: 0, failed: 1, total: 1 })
        return
      }

      const prepared = await prepareRename(oldPath, newPath)

      if (prepared.error) {
        send({
          type: 'init',
          total: 1,
          totalBytes: 0,
          estimatedSeconds: 0,
          preFailed: 1,
        })
        send({
          type: 'error',
          fileName: prepared.fileName,
          folder: prepared.folder,
          code: prepared.error.code,
        })
        send({ type: 'close', moved: 0, failed: 1, total: 1, totalBytes: 0 })
        return
      }

      const totalBytes = prepared.size || 0
      const bytesNeedingCopy = prepared.crossDevice ? totalBytes : 0
      const diskSpaceError = await checkRenameDiskSpace(prepared)

      if (diskSpaceError) {
        send({
          type: 'init',
          total: 1,
          totalBytes,
          estimatedSeconds: 0,
        })
        send({
          type: 'error',
          fileName: prepared.fileName,
          folder: prepared.folder,
          code: 'NO_SPACE',
          required: diskSpaceError.required,
          available: diskSpaceError.available,
        })
        send({ type: 'close', moved: 0, failed: 1, total: 1, totalBytes })
        return
      }

      const estimatedSeconds = estimateSeconds(totalBytes, bytesNeedingCopy)
      send({
        type: 'init',
        total: 1,
        totalBytes,
        estimatedSeconds,
        preFailed: 0,
      })

      const startedAt = Date.now()
      let moved = 0
      let failed = 0

      if (prepared.skip) {
        moved = 1
        send({
          type: 'success',
          fileName: prepared.fileName,
          folder: prepared.folder,
          newPath: prepared.newPath,
          skipped: true,
        })
      } else {
        try {
          await moveFile(prepared.oldPath, prepared.newPath, (transferred: number, size: number) => {
            const elapsed = (Date.now() - startedAt) / 1000
            const speed = elapsed > 0 ? transferred / elapsed : 0
            const remainingBytes = Math.max(0, totalBytes - transferred)
            const etaSeconds = speed > 0 ? Math.ceil(remainingBytes / speed) : estimatedSeconds

            send({
              type: 'progress',
              current: 1,
              total: 1,
              fileName: prepared.fileName,
              fileProgress: size > 0 ? Math.round((transferred / size) * 100) : 100,
              overallProgress: totalBytes > 0
                ? Math.round((transferred / totalBytes) * 100)
                : 100,
              etaSeconds,
              transferredBytes: transferred,
              totalBytes,
            })
          })

          moved = 1
          send({
            type: 'success',
            fileName: prepared.fileName,
            folder: prepared.folder,
            newPath: prepared.newPath,
          })
        } catch (error: unknown) {
          failed = 1
          const moveError = asMoveError(error)
          console.error(`Error renaming file ${prepared.fileName}:`, moveError.message)
          send({
            type: 'error',
            fileName: prepared.fileName,
            folder: prepared.folder,
            code: moveError.code || 'UNKNOWN',
            required: moveError.required,
            available: moveError.available,
            message: moveError.message,
          })
        }
      }

      send({
        type: 'close',
        moved,
        failed,
        total: 1,
        totalBytes,
        elapsedSeconds: Math.ceil((Date.now() - startedAt) / 1000),
      })
    }

    ws.on('message', async (rawMsg: unknown) => {
      try {
        await runLibraryOperation(async () => {
          const parsed = JSON.parse(String(rawMsg)) as MovingWsMessage
          switch (parsed.type) {
            case 'move':
              await moveFiles(parsed)
              break
            case 'rename':
              await renameFileOnDisk(parsed)
              break
          }
        })
      } catch (error: unknown) {
        console.error('Moving WebSocket error:', error)
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type: 'close', moved: 0, failed: 0, total: 0, error: true, code: (error as {code?: string})?.code }))
        }
      }
    })
  }
}

export function registerMovingWebSocket(wsApp: ExpressWithWs, db: ApiDb): void {
  wsApp.ws('/moving', createMovingWsHandler(db))
}
