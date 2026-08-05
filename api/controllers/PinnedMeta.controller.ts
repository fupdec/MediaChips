import type { ApiDb } from '../types/db'
import { sendControllerError, sendCreated, sendOk, paramString } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'
import { getRequestBody } from '../types/http'
import type { MetaAssignmentOrderPayload, PinChildMetaPayload } from '@shared/api/payloads'

import { createPinnedMetaRepository } from '../db/repositories/pinnedMeta'
import { parseOptionalInt } from '../utils/parseRequestNumber'

export default function (db: ApiDb) {
  const pinnedMetaRepo = createPinnedMetaRepository(db.drizzle)

  const create = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<PinChildMetaPayload>(req)
      const data = pinnedMetaRepo.create({
        metaId: Number(body.metaId),
        pinnedMetaId: Number(body.pinnedMetaId),
        order: body.order == null ? null : Number(body.order),
      })
      sendCreated(res, data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const findAll = function (req: ApiRequest, res: ApiResponse) {
    try {
      const filters = {
        metaId: parseOptionalInt(req.query.metaId),
        pinnedMetaId: parseOptionalInt(req.query.pinnedMetaId),
      }
      const data = pinnedMetaRepo.findAll(filters)
      sendOk(res, data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while retrieving media.')
    }
  }

  const findAllByPinnedMetaId = function (req: ApiRequest, res: ApiResponse) {
    try {
      const pinnedMetaId = parseOptionalInt(req.query.metaId)
      const data = pinnedMetaId == null
        ? []
        : pinnedMetaRepo.findAllByPinnedMetaId(pinnedMetaId)
      sendOk(res, data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while retrieving media.')
    }
  }

  const update = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<MetaAssignmentOrderPayload>(req)
      pinnedMetaRepo.update(
        Number(body.metaId),
        Number(body.pinnedMetaId),
        body.data,
      )
      sendOk(res, [1])
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while retrieving media.')
    }
  }

  const deleteOne = function (req: ApiRequest, res: ApiResponse) {
    try {
      pinnedMetaRepo.delete(
        parseInt(paramString(req.params.id), 10),
        parseInt(String(req.query.metaId ?? ''), 10),
      )
      sendOk(res)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  return {
    create,
    findAll,
    findAllByPinnedMetaId,
    update,
    deleteOne,
  }
}
