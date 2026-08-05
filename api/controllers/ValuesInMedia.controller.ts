import type { ApiDb } from '../types/db'
import { sendControllerError } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'

import { createValuesInMediaRepository } from '../db/repositories/valuesInMedia'
export default function (db: ApiDb) {
  const valuesInMediaRepo = createValuesInMediaRepository(db.drizzle)

  const create = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = valuesInMediaRepo.bulkCreate(req.body)
      res.status(201).send(data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const findAll = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = valuesInMediaRepo.findAllByMediaId(Number(req.query.mediaId))
      res.status(201).send(data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const deleteOne = function (req: ApiRequest, res: ApiResponse) {
    try {
      valuesInMediaRepo.deleteOne(Number(req.body.itemId), Number(req.body.metaId))
      res.sendStatus(201)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const deleteAllValuesByMediaId = function (req: ApiRequest, res: ApiResponse) {
    try {
      valuesInMediaRepo.deleteByMediaId(Number(req.params.id))
      res.sendStatus(201)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  return {
    create,
    findAll,
    deleteOne,
    deleteAllValuesByMediaId,
  }
}
