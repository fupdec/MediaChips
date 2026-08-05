import type { ApiDb } from '../types/db'
import { sendControllerError, sendOk } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'

import { createMediaTypesInWatchedFoldersRepository } from '../db/repositories/mediaTypesInWatchedFolders'
export default function (db: ApiDb) {
  const mediaTypesInWatchedFoldersRepo = createMediaTypesInWatchedFoldersRepository(db.drizzle)

  const findAll = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = mediaTypesInWatchedFoldersRepo.findAllWithRelations()
      sendOk(res, data)
    } catch (err) {
      sendControllerError(res, err, "Some error occurred while performing query.")
    }
  };

  return {
    findAll,
  }
}
