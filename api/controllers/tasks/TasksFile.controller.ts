import type { TaskControllerShared } from '../../types/tasks'
import { HttpError, apiErrorMessage, asApiError, sendControllerError } from '../../types/errors'
import type { ApiRequest, ApiResponse } from '../../types/http'
import path from 'path'
import { exec } from 'child_process'
import { resolveExistingPath } from '../../services/contentHash'
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
      res.status(200).json({ exists: await zipEntryExists(filePath) })
      return
    }
    const resolved = filePath ? await resolveExistingPath(filePath) : null
    res.status(200).json({ exists: Boolean(resolved) })
  }

  const checkFilesExists = async function (req: ApiRequest, res: ApiResponse) {
    const paths = Array.isArray(req.body.paths) ? req.body.paths : []
    const results = await checkFilesExist(paths)
    res.status(200).json({ results })
  }

  const renameFile = async function (req: ApiRequest, res: ApiResponse) {
    const { old_path, new_path } = req.body

    if (isVirtualZipPath(String(old_path || '')) || isVirtualZipPath(String(new_path || ''))) {
      return res.status(400).send({
        code: 'ZIP_READONLY',
        message: 'Files inside ZIP archives are read-only',
        fileName: path.basename(String(old_path || new_path || '')),
        folder: path.dirname(String(old_path || new_path || '')),
      })
    }

    try {
      const prepared = await prepareRename(old_path, new_path)

      if (prepared.error) {
        return res.status(400).send({
          code: prepared.error.code,
          fileName: prepared.fileName,
          folder: prepared.folder,
        })
      }

      if (prepared.skip) {
        return res.sendStatus(201)
      }

      const diskSpaceError = await checkRenameDiskSpace(prepared)
      if (diskSpaceError) {
        return res.status(400).send({
          code: 'NO_SPACE',
          required: diskSpaceError.required,
          available: diskSpaceError.available,
          fileName: prepared.fileName,
          folder: prepared.folder,
        })
      }

      await moveFile(old_path, new_path)
      res.sendStatus(201)
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
      return res.status(400).send({
        message: 'Cannot open files inside ZIP archives in the system file manager',
      })
    }
    const revealInFolder = Boolean(req.body.isDir)
    const entryPath = revealInFolder ? path.dirname(rawPath) : rawPath

    const fail = (message: string) => res.status(400).send({message})

    try {
      const electron = await import('electron').catch(() => null)
      if (electron?.shell) {
        if (revealInFolder) {
          electron.shell.showItemInFolder(rawPath)
          return res.sendStatus(201)
        }
        const error = await electron.shell.openPath(entryPath)
        if (error) return fail(error)
        return res.sendStatus(201)
      }
    } catch (_) {
      // Non-Electron environment (e.g. standalone API dev server)
    }

    const command = process.platform === 'darwin'
      ? (revealInFolder
        ? `open -R ${JSON.stringify(rawPath)}`
        : `open ${JSON.stringify(entryPath)}`)
      : process.platform === 'win32'
        ? (revealInFolder
          ? `explorer /select,${JSON.stringify(rawPath)}`
          : `start "" ${JSON.stringify(entryPath)}`)
        : `xdg-open ${JSON.stringify(entryPath)}`

    exec(command, (err: unknown) => {
      if (err) return fail(apiErrorMessage(err))
      res.sendStatus(201)
    })
  }

  const openInExternalPlayer = async function (req: ApiRequest, res: ApiResponse) {
    const player = String(req.body?.player || '') as ExternalPlayerKind
    const mediaPath = normalizeMediaPath(req.body?.path)
    const mediaIdRaw = req.body?.mediaId
    const mediaId = mediaIdRaw == null || mediaIdRaw === ''
      ? null
      : Number(mediaIdRaw)

    if (player !== 'mpv' && player !== 'iina') {
      res.status(400).send({message: 'player must be mpv or iina'})
      return
    }

    if (!mediaPath) {
      res.status(400).send({message: 'path is required'})
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
      res.status(201).send(result)
    } catch (err: unknown) {
      if (err instanceof ExternalPlayerError) {
        sendControllerError(res, new HttpError(400, err.message, {code: err.code}), err.message)
        return
      }
      sendControllerError(
        res,
        err instanceof HttpError ? err : new HttpError(400, apiErrorMessage(err) || String(err)),
        'Failed to open in external player',
      )
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
      res.status(201).send({ files, skippedZips })
    } catch (error: unknown) {
      const message = apiErrorMessage(error) || String(error)
      if (message === 'not directory') {
        sendControllerError(res, new HttpError(400, 'not directory'), 'not directory')
        return
      }
      sendControllerError(
        res,
        error instanceof HttpError ? error : new HttpError(400, message),
        'Failed to list files',
      )
    }
  }

  const deleteFile = async function (req: ApiRequest, res: ApiResponse) {
    try {
      if (isVirtualZipPath(String(req.body.path || ''))) {
        return res.status(400).send({
          message: 'Files inside ZIP archives are read-only',
        })
      }

      const deleted = await unlinkResolvedPath(req.body.path)

      if (!deleted) {
        return res.status(404).send({
          message: 'File not found.',
        })
      }

      res.status(201).send({
        message: 'successfully deleted local file',
      })
    } catch (err) {
      sendControllerError(
        res,
        err instanceof HttpError ? err : new HttpError(400, apiErrorMessage(err) || String(err)),
        'Failed to delete file',
      )
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
