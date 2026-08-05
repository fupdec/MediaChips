import type { ApiDb } from '../types/db'
import { sendControllerError, sendOk, paramString } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'

import { createVideoMetadataRepository } from '../db/repositories/videoMetadata'
export default function (db: ApiDb) {
  const videoMetadataRepo = createVideoMetadataRepository(db.drizzle)

  const findOne = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = videoMetadataRepo.findByMediaId(Number(req.params.id)) ?? null
      sendOk(res, data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while retrieving media.')
    }
  }

  const update = function (req: ApiRequest, res: ApiResponse) {
    try {
      videoMetadataRepo.updateByMediaId(parseInt(paramString(req.params.id), 10), req.body)
      sendOk(res)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  return {
    findOne,
    update,
  }
}
