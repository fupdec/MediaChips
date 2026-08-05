import type { ApiDb } from '../types/db'
import { sendControllerError } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'

const QUERY_ERROR = 'Some error occurred while performing query.'

export type OwnerValuesRepository = {
  bulkCreate: (body: unknown) => unknown
  findAllByOwner: (ownerId: number) => unknown
  deleteOne: (itemId: number, metaId: number) => unknown
  deleteByOwner: (ownerId: number) => unknown
}

export type OwnerValuesControllerOptions = {
  ownerQueryKey: 'mediaId' | 'tagId'
  deleteAllMethodName: 'deleteAllValuesByMediaId' | 'deleteAllValuesByTagId'
  createRepository: (db: ApiDb) => OwnerValuesRepository
}

export function createOwnerValuesController(options: OwnerValuesControllerOptions) {
  return function ownerValuesController(db: ApiDb) {
    const repo = options.createRepository(db)

    const create = function (req: ApiRequest, res: ApiResponse) {
      try {
        const data = repo.bulkCreate(req.body)
        res.status(201).send(data)
      } catch (err: unknown) {
        sendControllerError(res, err, QUERY_ERROR)
      }
    }

    const findAll = function (req: ApiRequest, res: ApiResponse) {
      try {
        const data = repo.findAllByOwner(Number(req.query[options.ownerQueryKey]))
        res.status(201).send(data)
      } catch (err: unknown) {
        sendControllerError(res, err, QUERY_ERROR)
      }
    }

    const deleteOne = function (req: ApiRequest, res: ApiResponse) {
      try {
        repo.deleteOne(Number(req.body.itemId), Number(req.body.metaId))
        res.sendStatus(201)
      } catch (err: unknown) {
        sendControllerError(res, err, QUERY_ERROR)
      }
    }

    const deleteAllByOwner = function (req: ApiRequest, res: ApiResponse) {
      try {
        repo.deleteByOwner(Number(req.params.id))
        res.sendStatus(201)
      } catch (err: unknown) {
        sendControllerError(res, err, QUERY_ERROR)
      }
    }

    return {
      create,
      findAll,
      deleteOne,
      [options.deleteAllMethodName]: deleteAllByOwner,
    }
  }
}
