import type { ApiDb } from '../types/db'
import { sendControllerError, sendOk } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'

import { createMetaSettingsRepository } from '../db/repositories/metaSettings'
export default function (db: ApiDb) {
  const metaSettingsRepo = createMetaSettingsRepository(db.drizzle)

  const findOne = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = metaSettingsRepo.findByMetaId(Number(req.params.id)) ?? null
      sendOk(res, data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while retrieving media.')
    }
  }

  const update = function (req: ApiRequest, res: ApiResponse) {
    try {
      metaSettingsRepo.updateByMetaId(Number(req.params.id), req.body)
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
