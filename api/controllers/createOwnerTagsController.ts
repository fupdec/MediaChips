import type { ApiDb } from '../types/db'
import { sendControllerError, sendCreated, sendOk } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'

const QUERY_ERROR = 'Some error occurred while performing query.'

export type OwnerTagsRepository = {
  bulkCreate: (body: unknown) => unknown
  findOrCreate: (body: unknown) => unknown
  findAllByOwner: (ownerId: number) => unknown
  deleteByOwner: (ownerId: number) => unknown
  deleteOne: (ownerId: number, tagId: number) => unknown
  deleteByOwnerAndMeta: (itemId: number, metaId: number) => unknown
}

export type OwnerTagsControllerOptions = {
  ownerQueryKey: 'mediaId' | 'tagId'
  deleteFromMethodName: 'deleteFromMedia' | 'deleteFromTag'
  deleteOwnerBodyKey: 'mediaId' | 'parentTagId'
  createRepository: (db: ApiDb) => OwnerTagsRepository
}

export function createOwnerTagsController(options: OwnerTagsControllerOptions) {
  return function ownerTagsController(db: ApiDb) {
    const repo = options.createRepository(db)

    const bulkCreate = function (req: ApiRequest, res: ApiResponse) {
      try {
        const data = repo.bulkCreate(req.body)
        sendCreated(res, data)
      } catch (err: unknown) {
        sendControllerError(res, err, QUERY_ERROR)
      }
    }

    const create = function (req: ApiRequest, res: ApiResponse) {
      try {
        const data = repo.findOrCreate(req.body)
        sendCreated(res, data)
      } catch (err: unknown) {
        sendControllerError(res, err, QUERY_ERROR)
      }
    }

    const findAll = function (req: ApiRequest, res: ApiResponse) {
      try {
        const data = repo.findAllByOwner(Number(req.query[options.ownerQueryKey]))
        sendOk(res, data)
      } catch (err: unknown) {
        sendControllerError(res, err, QUERY_ERROR)
      }
    }

    const deleteOne = function (req: ApiRequest, res: ApiResponse) {
      try {
        repo.deleteByOwner(Number(req.params.id))
        sendOk(res)
      } catch (err: unknown) {
        sendControllerError(res, err, QUERY_ERROR)
      }
    }

    const deleteFromOwner = function (req: ApiRequest, res: ApiResponse) {
      try {
        repo.deleteOne(
          Number(req.body[options.deleteOwnerBodyKey]),
          Number(req.body.tagId),
        )
        sendOk(res)
      } catch (err: unknown) {
        sendControllerError(res, err, QUERY_ERROR)
      }
    }

    const deleteAllTagsByMetaId = function (req: ApiRequest, res: ApiResponse) {
      try {
        repo.deleteByOwnerAndMeta(Number(req.body.itemId), Number(req.body.metaId))
        sendOk(res)
      } catch (err: unknown) {
        sendControllerError(res, err, QUERY_ERROR)
      }
    }

    return {
      bulkCreate,
      create,
      findAll,
      deleteOne,
      deleteAllTagsByMetaId,
      [options.deleteFromMethodName]: deleteFromOwner,
    }
  }
}
