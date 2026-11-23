import type { ApiDb } from '../../api/types/db'
import type {
  DiskSpaceError,
  MoveFileResult,
  MoveItemInput,
  MoveProgressHandler,
  PrepareMoveItemsResult,
  PreparedMoveItem,
  PreparedRenameItem,
} from '../types/moveFile'
import { promises as fs } from 'fs'
import fssync from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'
import { createMediaRepository } from '../../api/db/repositories/media'
import { clearResolvedPathCache } from '../server/resolvePathCache'

const ERROR_CODES = {
  NOT_FOUND: 'NOT_FOUND',
  EXISTS: 'EXISTS',
  NO_SPACE: 'NO_SPACE',
  ACCESS_DENIED: 'ACCESS_DENIED',
  DB_NOT_FOUND: 'DB_NOT_FOUND',
  UNKNOWN: 'UNKNOWN',
} as const

type MoveFileError = Error & {
  code?: string
  required?: number
  available?: number
}

async function getFreeDiskSpace(targetPath: string): Promise<number | null> {
  try {
    const dir = (await fs.stat(targetPath).catch(() => null))?.isDirectory()
      ? targetPath
      : path.dirname(targetPath)
    const stats = await fs.statfs(dir)
    return stats.bavail * stats.bsize
  } catch {
    return null
  }
}

async function isCrossDevice(sourcePath: string, destinationPath: string): Promise<boolean> {
  try {
    const sourceStat = await fs.stat(sourcePath)
    const destDir = path.dirname(destinationPath)
    await fs.mkdir(destDir, { recursive: true })
    const destStat = await fs.stat(destDir)
    return sourceStat.dev !== destStat.dev
  } catch {
    return true
  }
}

async function copyFileWithProgress(
  sourcePath: string,
  destinationPath: string,
  onProgress?: MoveProgressHandler,
): Promise<void> {
  const { size } = await fs.stat(sourcePath)
  let transferred = 0

  const readStream = fssync.createReadStream(sourcePath)
  // 'wx' never opens a file that appeared after the existence check, so cleanup below only ever
  // removes a file this copy created itself.
  const writeStream = fssync.createWriteStream(destinationPath, { flags: 'wx' })
  let created = false
  writeStream.once('open', () => { created = true })

  readStream.on('data', (chunk: Buffer) => {
    transferred += chunk.length
    if (onProgress) onProgress(transferred, size)
  })

  try {
    await pipeline(readStream, writeStream)
  } catch (error) {
    // A truncated copy would look like a finished one: later moves would refuse to overwrite it.
    // The source is untouched until the copy succeeds, so dropping the partial file loses nothing.
    if (created) await fs.unlink(destinationPath).catch(() => undefined)
    throw error
  }
  if (onProgress) onProgress(size, size)
}

async function moveFile(
  sourcePath: string,
  destinationPath: string,
  onProgress?: MoveProgressHandler,
): Promise<MoveFileResult> {
  if (!(await fs.stat(sourcePath).catch(() => null))) {
    const err: MoveFileError = new Error('Source file not found')
    err.code = ERROR_CODES.NOT_FOUND
    throw err
  }

  if (await fs.stat(destinationPath).catch(() => null)) {
    const err: MoveFileError = new Error('Destination file already exists')
    err.code = ERROR_CODES.EXISTS
    throw err
  }

  const destDir = path.dirname(destinationPath)
  await fs.mkdir(destDir, { recursive: true })

  const crossDevice = await isCrossDevice(sourcePath, destinationPath)

  if (crossDevice) {
    const fileSize = (await fs.stat(sourcePath)).size
    const freeSpace = await getFreeDiskSpace(destinationPath)
    if (freeSpace !== null && freeSpace < fileSize) {
      const err: MoveFileError = new Error('Not enough disk space')
      err.code = ERROR_CODES.NO_SPACE
      err.required = fileSize
      err.available = freeSpace
      throw err
    }

    await copyFileWithProgress(sourcePath, destinationPath, onProgress)
    await fs.unlink(sourcePath)
    clearResolvedPathCache()
    return { crossDevice: true, size: fileSize }
  }

  try {
    await fs.rename(sourcePath, destinationPath)
    if (onProgress) {
      const size = (await fs.stat(destinationPath)).size
      onProgress(size, size)
    }
    clearResolvedPathCache()
    return { crossDevice: false, size: (await fs.stat(destinationPath)).size }
  } catch (error: unknown) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code === 'EXDEV') {
      const fileSize = (await fs.stat(sourcePath)).size
      const freeSpace = await getFreeDiskSpace(destinationPath)
      if (freeSpace !== null && freeSpace < fileSize) {
        const err: MoveFileError = new Error('Not enough disk space')
        err.code = ERROR_CODES.NO_SPACE
        err.required = fileSize
        err.available = freeSpace
        throw err
      }

      await copyFileWithProgress(sourcePath, destinationPath, onProgress)
      await fs.unlink(sourcePath)
      clearResolvedPathCache()
      return { crossDevice: true, size: fileSize }
    }

    if (nodeError.code === 'EACCES' || nodeError.code === 'EPERM') {
      const err: MoveFileError = new Error('Access denied')
      err.code = ERROR_CODES.ACCESS_DENIED
      throw err
    }

    const err: MoveFileError = new Error(nodeError.message || 'Move failed')
    err.code = ERROR_CODES.UNKNOWN
    throw err
  }
}

async function prepareMoveItems(db: ApiDb, items: MoveItemInput[]): Promise<PrepareMoveItemsResult> {
  const prepared: PreparedMoveItem[] = []
  let totalBytes = 0
  let bytesNeedingCopy = 0

  for (const item of items) {
    const media = createMediaRepository(db.drizzle).findById(Number(item.id))
    if (!media) {
      prepared.push({
        id: item.id,
        error: { code: ERROR_CODES.DB_NOT_FOUND, message: 'Media not found in database' },
      })
      continue
    }

    const oldPath = String(media.path ?? '')
    const fileName = path.basename(oldPath)
    const newPath = path.join(item.folder, fileName)

    const sourceExists = await fs.stat(oldPath).catch(() => null)
    if (!sourceExists) {
      prepared.push({
        id: item.id,
        fileName,
        folder: item.folder,
        oldPath,
        newPath,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'Source file not found' },
      })
      continue
    }

    if (path.resolve(oldPath) === path.resolve(newPath)) {
      prepared.push({
        id: item.id,
        fileName,
        folder: item.folder,
        oldPath,
        newPath,
        skip: true,
        size: sourceExists.size,
      })
      continue
    }

    const destExists = await fs.stat(newPath).catch(() => null)
    if (destExists) {
      prepared.push({
        id: item.id,
        fileName,
        folder: item.folder,
        oldPath,
        newPath,
        error: { code: ERROR_CODES.EXISTS, message: 'Destination file already exists' },
      })
      continue
    }

    const size = sourceExists.size
    totalBytes += size

    const crossDevice = await isCrossDevice(oldPath, newPath)
    if (crossDevice) bytesNeedingCopy += size

    prepared.push({
      id: item.id,
      fileName,
      folder: item.folder,
      oldPath,
      newPath,
      size,
      crossDevice,
    })
  }

  return { prepared, totalBytes, bytesNeedingCopy }
}

async function checkBatchDiskSpace(
  prepared: PreparedMoveItem[],
  bytesNeedingCopy: number,
): Promise<DiskSpaceError | null> {
  if (bytesNeedingCopy <= 0) return null

  const spaceByRoot = new Map<string, number>()

  for (const item of prepared) {
    if (!item.crossDevice || item.error || !item.newPath || item.size == null) continue
    const root = path.parse(item.newPath).root
    spaceByRoot.set(root, (spaceByRoot.get(root) || 0) + item.size)
  }

  for (const [root, required] of spaceByRoot) {
    const samplePath = prepared.find(
      (entry) => entry.newPath && path.parse(entry.newPath).root === root,
    )?.newPath
    if (!samplePath) continue

    const freeSpace = await getFreeDiskSpace(samplePath)
    if (freeSpace !== null && freeSpace < required) {
      return { required, available: freeSpace, root }
    }
  }

  return null
}

function estimateSeconds(totalBytes: number, bytesNeedingCopy: number): number {
  const renameBytes = totalBytes - bytesNeedingCopy
  const copySpeed = 80 * 1024 * 1024
  const copySeconds = bytesNeedingCopy / copySpeed
  const renameSeconds = renameBytes > 0 ? Math.min(2, Math.ceil(renameBytes / (5 * 1024 * 1024 * 1024))) : 0
  return Math.max(1, Math.ceil(copySeconds + renameSeconds))
}

async function prepareRename(oldPath: string, newPath: string): Promise<PreparedRenameItem> {
  const fileName = path.basename(newPath)
  const folder = path.dirname(newPath)

  const sourceExists = await fs.stat(oldPath).catch(() => null)
  if (!sourceExists) {
    return {
      oldPath,
      newPath,
      fileName,
      folder,
      error: { code: ERROR_CODES.NOT_FOUND, message: 'Source file not found' },
    }
  }

  if (path.resolve(oldPath) === path.resolve(newPath)) {
    return {
      oldPath,
      newPath,
      fileName,
      folder,
      skip: true,
      size: sourceExists.size,
    }
  }

  const destExists = await fs.stat(newPath).catch(() => null)
  if (destExists) {
    return {
      oldPath,
      newPath,
      fileName,
      folder,
      error: { code: ERROR_CODES.EXISTS, message: 'Destination file already exists' },
    }
  }

  const size = sourceExists.size
  const crossDevice = await isCrossDevice(oldPath, newPath)

  return {
    oldPath,
    newPath,
    fileName,
    folder,
    size,
    crossDevice,
  }
}

async function checkRenameDiskSpace(prepared: PreparedRenameItem): Promise<DiskSpaceError | null> {
  if (!prepared.crossDevice || prepared.size == null || !prepared.newPath) return null

  const freeSpace = await getFreeDiskSpace(prepared.newPath)
  if (freeSpace !== null && freeSpace < prepared.size) {
    return { required: prepared.size, available: freeSpace }
  }

  return null
}

export {
  ERROR_CODES,
  moveFile,
  prepareMoveItems,
  prepareRename,
  checkBatchDiskSpace,
  checkRenameDiskSpace,
  estimateSeconds,
  isCrossDevice,
  getFreeDiskSpace,
}
