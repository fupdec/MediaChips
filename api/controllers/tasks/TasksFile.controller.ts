import type { TaskControllerShared } from '../../types/tasks'
import { apiErrorMessage, asApiError } from '../../types/errors'
import type { ApiRequest, ApiResponse } from '../../types/http'
import path from 'path'
import { exec } from 'child_process'
import { readdir, lstat } from 'fs/promises'
import { resolveExistingPath } from '../../services/contentHash'
import { checkFilesExist } from '../../services/checkFilesExist'
import { normalizeMediaPath } from '../../utils/normalizeUserPath'
import { unlinkResolvedPath } from '../../services/localAssetCleanup'
import {
  moveFile,
  prepareRename,
  checkRenameDiskSpace,
} from '../../../app/tasks/moveFile'

export default function createTasksFileController(_shared: TaskControllerShared) {
  const checkFileExists = async function (req: ApiRequest, res: ApiResponse) {
    const filePath = normalizeMediaPath(req.body.path)
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
      res.status(400).send({
        code: apiErr.code || 'UNKNOWN',
        message: apiErr.message,
        required: apiErr.required,
        available: apiErr.available,
        fileName: path.basename(new_path),
        folder: path.dirname(new_path),
      })
    }
  }

  const openPath = async function (req: ApiRequest, res: ApiResponse) {
    let entryPath = path.normalize(req.body.path)
    if (req.body.isDir) entryPath = path.dirname(entryPath)

    const fail = (message: string) => res.status(400).send({message})

    try {
      const electron = await import('electron').catch(() => null)
      if (electron?.shell) {
        const error = await electron.shell.openPath(entryPath)
        if (error) return fail(error)
        return res.sendStatus(201)
      }
    } catch (_) {
      // Non-Electron environment (e.g. standalone API dev server)
    }

    const command = process.platform === 'darwin'
      ? `open ${JSON.stringify(entryPath)}`
      : process.platform === 'win32'
        ? `start "" ${JSON.stringify(entryPath)}`
        : `xdg-open ${JSON.stringify(entryPath)}`

    exec(command, (err: unknown) => {
      if (err) return fail(apiErrorMessage(err))
      res.sendStatus(201)
    })
  }

  const getFileList = async function (req: ApiRequest, res: ApiResponse) {
    async function findInDir(rootDir: string, regex: RegExp, excluded: string[]) {
      const fileList = []
      const stack = [rootDir]
      let scanned = 0

      while (stack.length) {
        const dir = stack.pop()
        if (!dir) continue
        let files

        try {
          files = await readdir(dir, {withFileTypes: true})
        } catch (_err) {
          continue
        }

        for (const file of files) {
          const filePath = path.join(dir, file.name)

          if (excluded.some((exclude: string) => filePath.includes(exclude))) {
            continue
          }

          if (file.isDirectory()) {
            stack.push(filePath)
          } else if (file.isFile() && regex.test(filePath.toLowerCase())) {
            fileList.push(filePath)
          }

          scanned += 1
          if (scanned % 500 === 0) {
            await new Promise(resolve => setImmediate(resolve))
          }
        }
      }

      return fileList
    }

    const entryPath = path.join(req.body.path);
    const regexObj = JSON.parse(req.body.filter);
    const excluded = Array.isArray(req.body.excluded) ? req.body.excluded : [];
    const regex = new RegExp(regexObj);

    let fileStat
    try {
      fileStat = await lstat(entryPath)
    } catch (error) {
      res.status(400).send({
        message: error
      })
      return
    }

    if (fileStat.isFile() && regex.test(entryPath.toLowerCase())) {
      res.status(201).send([entryPath])
      return
    } else if (!fileStat.isDirectory()) {
      res.status(400).send({
        message: "not directory"
      })
      return
    }

    const fileList = await findInDir(entryPath, regex, excluded)
    res.status(201).send(fileList)
  }

  const deleteFile = async function (req: ApiRequest, res: ApiResponse) {
    try {
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
      res.status(400).send(err)
    }
  }

  return {
    checkFileExists,
    checkFilesExists,
    renameFile,
    openPath,
    getFileList,
    deleteFile,
  }
}
