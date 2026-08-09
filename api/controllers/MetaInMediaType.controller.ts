import type { ApiDb } from '../types/db'
import { sendControllerError, sendCreated, sendOk } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'
import { getRequestBody } from '../types/http'
import type { MetaAssignmentOrderPayload, PinMetaAssignmentPayload } from '@shared/api/payloads'

import { createMetaInMediaTypesRepository } from '../db/repositories/metaInMediaTypes'
import { createMetaRepository } from '../db/repositories/meta'
import { parseOptionalInt } from '../utils/parseRequestNumber'

function isParserEnabled(value: unknown): boolean {
  return value === true || value === 1 || value === '1'
}

export default function (db: ApiDb) {
  const metaInMediaTypesRepo = createMetaInMediaTypesRepository(db.drizzle)
  const metaRepo = createMetaRepository(db.drizzle)

  const create = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<PinMetaAssignmentPayload>(req)
      const metaId = Number(body.metaId)
      const mediaTypeId = Number(body.mediaTypeId)
      const hadAssignments = metaInMediaTypesRepo.findByMetaId(metaId).length > 0

      const data = metaInMediaTypesRepo.create({
        metaId,
        mediaTypeId,
        order: body.order == null ? null : Number(body.order),
      })

      // First media assignment: enable path parsing for tag categories unless already on.
      // Users can turn the option off afterwards in field settings.
      if (!hadAssignments) {
        const metaRow = metaRepo.findById(metaId)
        if (metaRow?.type === 'array' && !isParserEnabled(metaRow.parser)) {
          metaRepo.updateById(metaId, {parser: true})
        }
      }

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
