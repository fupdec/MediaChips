import fs from 'fs'
import {
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type IpcMainInvokeEvent,
} from 'electron'
import {normalizeMediaPath} from '../api/utils/normalizeUserPath'
import {resolveExistingPath} from '../api/services/contentHash'
import {apiErrorMessage} from '../api/types/errors'
import {openExistingPath} from './openExistingPath'

export function parseExternalUrl(rawUrl: unknown): {ok: true; url: string} | {ok: false; error: string} {
  const url = String(rawUrl || '').trim()
  if (!url) return {ok: false, error: 'URL is required'}

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return {ok: false, error: 'Invalid URL'}
  }

  if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
    return {ok: false, error: 'Unsupported URL protocol'}
  }

  return {ok: true, url: parsed.toString()}
}

export function registerShellIpc(deps: {
  log?: (...args: unknown[]) => void
} = {}) {
  const log = deps.log || (() => {})

  ipcMain.handle('checkFileExists', async (_event: IpcMainInvokeEvent, data: Record<string, unknown>) => {
    const rawPath = typeof data === 'string' ? data : data?.path
    if (!rawPath) return false

    try {
      const filePath = normalizeMediaPath(rawPath)
      return Boolean(await resolveExistingPath(filePath))
    } catch {
      return false
    }
  })

  ipcMain.handle('openPath', async (_event: IpcMainInvokeEvent, data: Record<string, unknown> | string) => {
    // Always return a cloneable result — unhandled throws/hangs surface as
    // "Error invoking remote method 'openPath': reply was never sent".
    try {
      const rawPath = typeof data === 'string' ? data : data?.path
      if (rawPath == null || rawPath === '') return {error: 'Path is required'}

      const entryPath = normalizeMediaPath(String(rawPath))
      const existingPath = await resolveExistingPath(entryPath)
      if (!existingPath) return {error: 'Path does not exist'}

      const revealInFolder = typeof data === 'object' && data !== null && Boolean(data.isDir)
      return await openExistingPath(existingPath, revealInFolder, {
        openPath: (target) => shell.openPath(target),
        showItemInFolder: (target) => shell.showItemInFolder(target),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'Failed to open path')
      return {error: message || 'Failed to open path'}
    }
  })

  ipcMain.handle('openExternal', async (_event: IpcMainInvokeEvent, rawUrl: unknown) => {
    const parsed = parseExternalUrl(rawUrl)
    if (parsed.ok === false) return {error: parsed.error}

    try {
      await shell.openExternal(parsed.url)
      return {success: true}
    } catch (error) {
      return {error: error instanceof Error ? error.message : String(error)}
    }
  })

  ipcMain.handle('dialog:saveFile', async (event: IpcMainInvokeEvent, options: {
    defaultPath?: string
    content?: string
    write?: boolean
    filters?: Array<{name: string; extensions: string[]}>
  } = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const dialogOptions = {
      defaultPath: options.defaultPath,
      filters: options.filters || [{name: 'All Files', extensions: ['*']}],
    }
    if (win && !win.isDestroyed()) win.focus()
    const result = win && !win.isDestroyed()
      ? await dialog.showSaveDialog(win, dialogOptions)
      : await dialog.showSaveDialog(dialogOptions)

    if (result.canceled || !result.filePath) {
      return {canceled: true}
    }

    if (options.write !== false) {
      fs.writeFileSync(result.filePath, options.content ?? '', 'utf8')
    }
    return {canceled: false, filePath: result.filePath}
  })

  ipcMain.handle('showOpenDialog', async (event: IpcMainInvokeEvent, properties: unknown) => {
    log('showOpenDialog called with properties:', properties)

    let dialogProperties: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles'> = []
    let filters: Array<{name: string; extensions: string[]}> | undefined

    if (properties && typeof properties === 'object' && !Array.isArray(properties) && 'properties' in (properties as object)) {
      const options = properties as {properties?: unknown; filters?: unknown}
      if (Array.isArray(options.properties)) {
        dialogProperties = options.properties as typeof dialogProperties
      }
      if (Array.isArray(options.filters)) {
        filters = options.filters as typeof filters
      }
    } else if (Array.isArray(properties)) {
      dialogProperties = properties as typeof dialogProperties
    } else if (typeof properties === 'string') {
      dialogProperties = [properties as typeof dialogProperties[number]]
    } else if (typeof properties === 'object' && properties !== null) {
      dialogProperties = Object.keys(properties).filter(
        (key) => (properties as Record<string, unknown>)[key] === true,
      ) as typeof dialogProperties
    }

    log('Dialog properties being used:', dialogProperties)

    try {
      // Parent window is required on macOS so NSOpenPanel attaches as a sheet
      // and is not hidden behind nested Vuetify modals / the app window.
      const win = BrowserWindow.fromWebContents(event.sender)
      const dialogOptions = {
        properties: dialogProperties,
        ...(filters ? {filters} : {}),
      }
      if (win && !win.isDestroyed()) win.focus()
      const result = win && !win.isDestroyed()
        ? await dialog.showOpenDialog(win, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions)

      log('Dialog closed, result:', {
        canceled: result.canceled,
        filePaths: result.filePaths,
        filePathsLength: result.filePaths.length,
      })

      if (result.canceled) {
        return {canceled: true, filePaths: []}
      }

      return {
        canceled: false,
        filePaths: result.filePaths,
        message: 'Directories selected successfully',
      }
    } catch (error: unknown) {
      console.error('Error in showOpenDialog:', error)
      return {
        error: true,
        message: error instanceof Error ? apiErrorMessage(error) : String(error),
        filePaths: [],
      }
    }
  })
}
