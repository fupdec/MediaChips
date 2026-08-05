import type { ApiDb } from '../types/db'
import { sendControllerError, sendCreated, sendOk } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'
import { getRequestBody } from '../types/http'
import type { MetaAssignmentOrderPayload, PinMetaAssignmentPayload } from '@shared/api/payloads'

import { createMetaInMediaTypesRepository } from '../db/repositories/metaInMediaTypes'
import { parseOptionalInt } from '../utils/parseRequestNumber'

export default function (db: ApiDb) {
  const metaInMediaTypesRepo = createMetaInMediaTypesRepository(db.drizzle)

  const create = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<PinMetaAssignmentPayload>(req)
      const data = metaInMediaTypesRepo.create({
        metaId: Number(body.metaId),
        mediaTypeId: Number(body.mediaTypeId),
        order: body.order == null ? null : Number(body.order),
      })
      sendCreated(res, data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const findAll = function (req: ApiRequest, res: ApiResponse) {
    try {
      const mediaTypeId = parseOptionalInt(req.query.mediaTypeId)
      const metaId = parseOptionalInt(req.query.metaId)
      const data = mediaTypeId != null
        ? metaInMediaTypesRepo.findByMediaTypeId(mediaTypeId)
        : metaId != null
          ? metaInMediaTypesRepo.findByMetaId(metaId)
          : metaInMediaTypesRepo.findAll()

      sendOk(res, data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const update = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<MetaAssignmentOrderPayload>(req)
      metaInMediaTypesRepo.update(
        Number(body.metaId),
        Number(body.mediaTypeId),
        body.data,
      )
      sendOk(res, [1])
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while retrieving media.')
    }
  }

  const deleteOne = function (req: ApiRequest, res: ApiResponse) {
    try {
      metaInMediaTypesRepo.delete(
        parseInt(String(req.query.metaId ?? ''), 10),
        parseInt(String(req.query.mediaTypeId ?? ''), 10),
      )
      sendOk(res)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  return {
    create,
    findAll,
    update,
    deleteOne,
  }
}
