import type { ApiDb } from '../types/db'
import { sendControllerError } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'

import { createTagsInMediaRepository } from '../db/repositories/tagsInMedia'
export default function (db: ApiDb) {
  const tagsInMediaRepo = createTagsInMediaRepository(db.drizzle)

  const bulkCreate = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = tagsInMediaRepo.bulkCreate(req.body)
      res.status(201).send(data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const create = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = tagsInMediaRepo.findOrCreate(req.body)
      res.status(201).send(data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const findAll = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = tagsInMediaRepo.findAllByMediaId(Number(req.query.mediaId))
      res.status(201).send(data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const deleteOne = function (req: ApiRequest, res: ApiResponse) {
    try {
      tagsInMediaRepo.deleteByMediaId(Number(req.params.id))
      res.sendStatus(201)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const deleteFromMedia = function (req: ApiRequest, res: ApiResponse) {
    try {
      tagsInMediaRepo.deleteOne(Number(req.body.mediaId), Number(req.body.tagId))
      res.sendStatus(201)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const deleteAllTagsByMetaId = function (req: ApiRequest, res: ApiResponse) {
    try {
      tagsInMediaRepo.deleteByMediaAndMeta(Number(req.body.itemId), Number(req.body.metaId))
      res.sendStatus(201)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  return {
    bulkCreate,
    create,
    findAll,
    deleteFromMedia,
    deleteOne,
    deleteAllTagsByMetaId,
  }
}
