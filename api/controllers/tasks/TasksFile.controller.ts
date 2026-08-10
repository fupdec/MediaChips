import type { TaskControllerShared } from '../../types/tasks'
import {
  HttpError,
  apiErrorMessage,
  asApiError,
  sendAsClientError,
  sendBadRequest,
  sendControllerError,
  sendNotFound,
  sendOk,
} from '../../types/errors'
import type { ApiRequest, ApiResponse } from '../../types/http'
import path from 'path'
import { resolveExistingPath } from '../../services/contentHash'
import {
  openPathInFileManager,
  shouldUseOsOpenCommands,
} from '../../services/openPathInFileManager'
import { checkFilesExist } from '../../services/checkFilesExist'
import { normalizeMediaPath } from '../../utils/normalizeUserPath'
import { unlinkResolvedPath } from '../../services/localAssetCleanup'
import {
  moveFile,
  prepareRename,
  checkRenameDiskSpace,
} from '../../../app/tasks/moveFile'
import { createMarksRepository } from '../../db/repositories/marks'
import { marksToChapters, resolveMarkChaptersForPath } from '../../services/markChaptersForPath'
import {
  ExternalPlayerError,
  launchExternalPlayer,
  type ExternalPlayerKind,
} from '../../services/externalPlayerLaunch'
import {
  collectFilesWithZipGalleries,
  isVirtualZipPath,
  zipEntryExists,
} from '../../services/zipGallery'

export default function createTasksFileController(shared: TaskControllerShared) {
  const { db } = shared
  const marksRepo = createMarksRepository(db.drizzle)

  const checkFileExists = async function (req: ApiRequest, res: ApiResponse) {
    const filePath = normalizeMediaPath(req.body.path)
    if (isVirtualZipPath(filePath)) {
      sendOk(res, { exists: await zipEntryExists(filePath) })
      return
    }
    const resolved = filePath ? await resolveExistingPath(filePath) : null
    sendOk(res, { exists: Boolean(resolved) })
  }

  const checkFilesExists = async function (req: ApiRequest, res: ApiResponse) {
    const paths = Array.isArray(req.body.paths) ? req.body.paths : []
    const results = await checkFilesExist(paths)
    sendOk(res, { results })
  }

  const renameFile = async function (req: ApiRequest, res: ApiResponse) {
    const { old_path, new_path } = req.body

    if (isVirtualZipPath(String(old_path || '')) || isVirtualZipPath(String(new_path || ''))) {
      return sendBadRequest(res, 'Files inside ZIP archives are read-only', {
        code: 'ZIP_READONLY',
        fileName: path.basename(String(old_path || new_path || '')),
        folder: path.dirname(String(old_path || new_path || '')),
      })
    }

    try {
      const prepared = await prepareRename(old_path, new_path)

      if (prepared.error) {
        return sendBadRequest(res, String(prepared.error.code || 'Rename failed'), {
          code: prepared.error.code,
          fileName: prepared.fileName,
          folder: prepared.folder,
        })
      }

      if (prepared.skip) {
        return sendOk(res)
      }

      const diskSpaceError = await checkRenameDiskSpace(prepared)
      if (diskSpaceError) {
        return sendBadRequest(res, 'NO_SPACE', {
          code: 'NO_SPACE',
          required: diskSpaceError.required,
          available: diskSpaceError.available,
          fileName: prepared.fileName,
          folder: prepared.folder,
        })
      }

      await moveFile(old_path, new_path)
      sendOk(res)
    } catch (error: unknown) {
      const apiErr = asApiError(error)
      console.log('ERROR: ' + apiErr.message)
      sendControllerError(
        res,
        new HttpError(400, apiErr.message || 'Failed to rename file', {
          code: apiErr.code || 'UNKNOWN',
          required: apiErr.required,
          available: apiErr.available,
          fileName: path.basename(new_path),
          folder: path.dirname(new_path),
        }),
        'Failed to rename file',
      )
    }
  }

  const openPath = async function (req: ApiRequest, res: ApiResponse) {
    const rawPath = path.normalize(req.body.path)
    if (isVirtualZipPath(String(req.body.path || '')) || isVirtualZipPath(rawPath)) {
      return sendBadRequest(res, 'Cannot open files inside ZIP archives in the system file manager')
    }
    const revealInFolder = Boolean(req.body.isDir)
    const entryPath = revealInFolder ? path.dirname(rawPath) : rawPath

    const fail = (message: string) => sendBadRequest(res, message)

    // Prefer Electron shell only in the real Electron process — the API child
    // runs with ELECTRON_RUN_AS_NODE where shell.openPath often returns
    // "Command failed".
    if (!shouldUseOsOpenCommands()) {
      try {
        const electron = await import('electron').catch(() => null)
        if (electron?.shell) {
          if (revealInFolder) {
            electron.shell.showItemInFolder(rawPath)
            return sendOk(res)
          }
          const error = await electron.shell.openPath(entryPath)
          if (error) return fail(error)
          return sendOk(res)
        }
      } catch (_) {
        // Fall through to OS commands
      }
    }

    try {
      await openPathInFileManager(revealInFolder ? rawPath : entryPath, {revealInFolder})
      return sendOk(res)
    } catch (err: unknown) {
      return fail(apiErrorMessage(err) || 'Failed to open path')
    }
  }

  const openInExternalPlayer = async function (req: ApiRequest, res: ApiResponse) {
    const player = String(req.body?.player || '') as ExternalPlayerKind
    const mediaPath = normalizeMediaPath(req.body?.path)
    const mediaIdRaw = req.body?.mediaId
    const mediaId = mediaIdRaw == null || mediaIdRaw === ''
      ? null
      : Number(mediaIdRaw)

    if (player !== 'mpv' && player !== 'iina') {
      sendBadRequest(res, 'player must be mpv or iina')
      return
    }

    if (!mediaPath) {
      sendBadRequest(res, 'path is required')
      return
    }

    try {
      let chapters = [] as ReturnType<typeof marksToChapters>
      if (Number.isFinite(mediaId) && mediaId != null && mediaId > 0) {
        chapters = marksToChapters(marksRepo.findAllForVideo(mediaId))
      } else {
        chapters = resolveMarkChaptersForPath(db, mediaPath).chapters
      }

      const result = await launchExternalPlayer({
        player,
        mediaPath,
        chapters,
      })
      sendOk(res, result)
    } catch (err: unknown) {
      if (err instanceof ExternalPlayerError) {
        sendBadRequest(res, err.message, {code: err.code})
        return
      }
      sendAsClientError(res, err, 'Failed to open in external player')
    }
  }

  const getFileList = async function (req: ApiRequest, res: ApiResponse) {
    const entryPath = normalizeMediaPath(req.body.path)
    const regexObj = JSON.parse(req.body.filter)
    const excluded = Array.isArray(req.body.excluded) ? req.body.excluded : []
    const regex = new RegExp(regexObj)
    const expandZips = Boolean(req.body.expandZips)
    const extensions = Array.isArray(req.body.extensions)
      ? req.body.extensions.map((ext: unknown) => String(ext || '').trim().toLowerCase().replace(/^\./, '')).filter(Boolean)
      : []

    try {
      const { files, skippedZips } = await collectFilesWithZipGalleries({
        entryPath,
        regex,
        excluded,
        extensions,
        expandZips: expandZips && extensions.length > 0,
      })
      sendOk(res, { files, skippedZips })
    } catch (error: unknown) {
      const message = apiErrorMessage(error) || String(error)
      if (message === 'not directory') {
        sendBadRequest(res, 'not directory')
        return
      }
      sendAsClientError(res, error, 'Failed to list files')
    }
  }

  const deleteFile = async function (req: ApiRequest, res: ApiResponse) {
    try {
      if (isVirtualZipPath(String(req.body.path || ''))) {
        return sendBadRequest(res, 'Files inside ZIP archives are read-only')
      }

      const deleted = await unlinkResolvedPath(req.body.path)

      if (!deleted) {
        return sendNotFound(res, 'File not found.')
      }

      sendOk(res, {
        message: 'successfully deleted local file',
      })
    } catch (err) {
      sendAsClientError(res, err, 'Failed to delete file')
    }
  }

  return {
    checkFileExists,
    checkFilesExists,
    renameFile,
    openPath,
    openInExternalPlayer,
    getFileList,
    deleteFile,
  }
}
