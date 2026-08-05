import type { ApiDb } from '../types/db'
import { sendControllerError } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'

import { createTagsInTagRepository } from '../db/repositories/tagsInTag'
export default function (db: ApiDb) {
  const tagsInTagRepo = createTagsInTagRepository(db.drizzle)

  const bulkCreate = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = tagsInTagRepo.bulkCreate(req.body)
      res.status(201).send(data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const create = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = tagsInTagRepo.findOrCreate(req.body)
      res.status(201).send(data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const findAll = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = tagsInTagRepo.findAllByParentTagId(Number(req.query.tagId))
      res.status(201).send(data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const deleteOne = function (req: ApiRequest, res: ApiResponse) {
    try {
      tagsInTagRepo.deleteByParentTagId(Number(req.params.id))
      res.sendStatus(201)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const deleteFromTag = function (req: ApiRequest, res: ApiResponse) {
    try {
      tagsInTagRepo.deleteOne(Number(req.body.parentTagId), Number(req.body.tagId))
      res.sendStatus(201)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const deleteAllTagsByMetaId = function (req: ApiRequest, res: ApiResponse) {
    try {
      tagsInTagRepo.deleteByParentTagAndMeta(Number(req.body.itemId), Number(req.body.metaId))
      res.sendStatus(201)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  return {
    bulkCreate,
    create,
    findAll,
    deleteFromTag,
    deleteOne,
    deleteAllTagsByMetaId,
  }
}
