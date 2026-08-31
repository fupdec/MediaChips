import fs from 'fs'
import path from 'path'
import {openPathInFileManager} from '../api/services/openPathInFileManager'

export type OpenExistingPathHooks = {
  openPath: (target: string) => Promise<string>
  showItemInFolder: (target: string) => void
  openInFileManager?: (
    target: string,
    options?: {revealInFolder?: boolean},
  ) => Promise<void>
  resolvePath?: (target: string) => string
  isDirectory?: (target: string) => boolean
  replyTimeoutMs?: number
}

function pathIsDirectory(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory()
  } catch {
    return false
  }
}

function errorMessage(error: unknown, fallback = 'Failed to open path'): string {
  const message = error instanceof Error ? error.message : String(error || fallback)
  return message || fallback
}

/**
 * Open a path that already exists on disk.
 *
 * `shell.openPath` is unreliable for folders on Windows (returns
 * "Failed to open path") and can hang on some Launch Services states, so
 * directories go through the OS file manager first and file opens fall back
 * to it when Electron reports an error.
 */
export async function openExistingPath(
  existingPath: string,
  revealInFolder: boolean,
  hooks: OpenExistingPathHooks,
): Promise<{success: true} | {error: string}> {
  const resolvePath = hooks.resolvePath || path.resolve
  const absolutePath = resolvePath(existingPath)
  const openInFileManager = hooks.openInFileManager || openPathInFileManager
  const isDirectory = hooks.isDirectory || pathIsDirectory
  const replyTimeoutMs = hooks.replyTimeoutMs ?? 2_500

  if (revealInFolder) {
    try {
      hooks.showItemInFolder(absolutePath)
      return {success: true}
    } catch (error) {
      console.warn('showItemInFolder failed, falling back to file manager:', error)
    }
    try {
      await openInFileManager(absolutePath, {revealInFolder: true})
      return {success: true}
    } catch (error) {
      return {error: errorMessage(error)}
    }
  }

  if (isDirectory(absolutePath)) {
    try {
      await openInFileManager(absolutePath, {revealInFolder: false})
      return {success: true}
    } catch (error) {
      console.warn('openPathInFileManager failed for directory, trying shell.openPath:', error)
    }
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const openPromise = hooks.openPath(absolutePath)
  try {
    const error = await Promise.race([
      openPromise,
      new Promise<string>((resolve) => {
        timeoutId = setTimeout(() => resolve(''), replyTimeoutMs)
      }),
    ])
    if (!error) return {success: true}

    try {
      await openInFileManager(absolutePath, {revealInFolder: false})
      return {success: true}
    } catch {
      return {error: String(error)}
    }
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
    void openPromise.then((deferredError) => {
      if (deferredError) console.warn('openPath deferred error:', deferredError)
    }).catch((deferredError) => {
      console.warn('openPath deferred rejection:', deferredError)
    })
  }
}
