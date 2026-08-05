import type { ApiDb } from '../types/db'
import { sendControllerError } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'
import { getRequestBody } from '../types/http'
import type { MediaTypeWritePayload } from '@shared/api/payloads'
import { paramString } from '../types/errors'

import { createMediaTypesRepository, type MediaTypeInsert } from '../db/repositories/mediaTypes'

function normalizeMediaTypePayload(body: MediaTypeWritePayload): Partial<MediaTypeInsert> {
  const { hidden, ...rest } = body
  return {
    ...rest,
    ...(hidden !== undefined ? { hidden: Boolean(hidden) } : {}),
  }
}

export default function (db: ApiDb) {
  const mediaTypesRepo = createMediaTypesRepository(db.drizzle)

  const create = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<MediaTypeWritePayload>(req)
      const data = mediaTypesRepo.create(normalizeMediaTypePayload(body))
      res.status(201).send(data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const findAll = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = mediaTypesRepo.findAll()
      res.status(201).send(data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const findOne = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = mediaTypesRepo.findById(Number(req.params.id)) ?? null
      res.status(201).send(data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const update = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<MediaTypeWritePayload>(req)
      mediaTypesRepo.updateById(parseInt(paramString(req.params.id), 10), normalizeMediaTypePayload(body))
      res.sendStatus(201)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const deleteOne = function (req: ApiRequest, res: ApiResponse) {
    try {
      mediaTypesRepo.deleteById(Number(req.params.id))
      res.sendStatus(201)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  return {
    create,
    findAll,
    findOne,
    update,
    deleteOne,
  }
}
