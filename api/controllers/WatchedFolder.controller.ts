import type { ApiDb } from '../types/db'
import { sendControllerError, sendCreated, sendOk } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'

import { createWatchedFoldersRepository } from '../db/repositories/watchedFolders'
import { normalizeExcludedPaths } from '../utils/watchedFolderExcludes'
import { normalizeMediaPath } from '../utils/normalizeUserPath'

export default function (db: ApiDb) {
  const watchedFoldersRepo = createWatchedFoldersRepository(db.drizzle)

  const create = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const {
        folder,
        types,
      } = req.body

      const path = normalizeMediaPath(String(folder?.path || ''))
      const excludedPaths = Object.prototype.hasOwnProperty.call(folder || {}, 'excludedPaths')
        ? normalizeExcludedPaths(path, folder.excludedPaths)
        : undefined

      watchedFoldersRepo.upsertFolderWithTypes(
        {
          path,
          name: folder?.name,
          icon: folder?.icon,
          ...(excludedPaths !== undefined ? {excludedPaths} : {}),
          watch: typeof folder?.watch === 'boolean' ? folder.watch : undefined,
        },
        Array.isArray(types) ? types.map((type: unknown) => Number(type)) : [],
      )
      sendCreated(res)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const update = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = (req.body || {}) as Record<string, unknown>
      const patch: Record<string, unknown> = {}

      if (typeof body.path === 'string' && body.path.trim()) {
        patch.path = normalizeMediaPath(body.path.trim())
      }
      if (Object.prototype.hasOwnProperty.call(body, 'name')) {
        patch.name = body.name
      }
      if (typeof body.watch === 'boolean') {
        patch.watch = body.watch
      }
      if (Object.prototype.hasOwnProperty.call(body, 'icon')) {
        patch.icon = body.icon
      }
      if (Object.prototype.hasOwnProperty.call(body, 'excludedPaths')) {
        const root = typeof patch.path === 'string'
          ? patch.path
          : String(body.path || '')
        // Root may come from existing row inside repo when path omitted.
        patch.excludedPaths = Array.isArray(body.excludedPaths) || body.excludedPaths == null
          ? body.excludedPaths
          : []
        if (root) {
          patch.excludedPaths = normalizeExcludedPaths(root, patch.excludedPaths)
        }
      }

      watchedFoldersRepo.updateById(Number(req.params.id), patch)
      sendOk(res)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const deleteOne = function (req: ApiRequest, res: ApiResponse) {
    try {
      watchedFoldersRepo.deleteById(Number(req.params.id))
      sendOk(res)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  return {
    create,
    update,
    deleteOne,
  }
}
