import type { ApiDb } from '../types/db'
import { sendControllerError, sendCreated, sendOk } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'

import { createPageSettingsRepository } from '../db/repositories/pageSettings'
export default function (db: ApiDb) {
  const pageSettingsRepo = createPageSettingsRepository(db.drizzle)

  const create = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = pageSettingsRepo.findOrCreate(req.body)
      sendCreated(res, data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  /** Non-mutating lookup with full criteria (incl. nulls). Does not create defaults. */
  const find = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = pageSettingsRepo.findOne(req.body) ?? null
      sendOk(res, data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while retrieving media.')
    }
  }

  const findOne = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = pageSettingsRepo.findOne({
        metaId: req.query.metaId || null,
        mediaTypeId: req.query.mediaTypeId || null,
      }) ?? null
      sendOk(res, data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while retrieving media.')
    }
  }

  const update = function (req: ApiRequest, res: ApiResponse) {
    try {
      pageSettingsRepo.update(req.body.query, req.body.data)
      sendOk(res, [1])
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while retrieving media.')
    }
  }

  return {
    create,
    find,
    findOne,
    update,
  }
}
