import type { ApiDb } from '../types/db'
import { sendControllerError } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'

import { createWatchedFoldersRepository } from '../db/repositories/watchedFolders'
export default function (db: ApiDb) {
  const watchedFoldersRepo = createWatchedFoldersRepository(db.drizzle)

  const create = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const {
        folder,
        types,
      } = req.body

      watchedFoldersRepo.upsertFolderWithTypes(
        folder,
        Array.isArray(types) ? types.map((type: unknown) => Number(type)) : [],
      )
      res.sendStatus(201)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const update = function (req: ApiRequest, res: ApiResponse) {
    try {
      watchedFoldersRepo.updateById(Number(req.params.id), req.body)
      res.sendStatus(201)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const deleteOne = function (req: ApiRequest, res: ApiResponse) {
    try {
      watchedFoldersRepo.deleteById(Number(req.params.id))
      res.sendStatus(201)
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
