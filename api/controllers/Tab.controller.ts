import type { ApiDb } from '../types/db'
import { sendControllerError, sendCreated, sendOk } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'
import type { TabCreatePayload, TabUpdatePayload } from '@shared/api/payloads'
import { getRequestBody } from '../types/http'

import { createTabsRepository } from '../db/repositories/tabs'
export default function (db: ApiDb) {
  const tabsRepo = createTabsRepository(db.drizzle)

  const create = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<TabCreatePayload>(req)
      const data = tabsRepo.create(body)
      sendCreated(res, data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const findAll = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = tabsRepo.findAll()
      sendOk(res, data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const update = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<TabUpdatePayload>(req)
      tabsRepo.updateById(Number(req.params.id), body)
      sendOk(res)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const deleteOne = function (req: ApiRequest, res: ApiResponse) {
    try {
      tabsRepo.deleteById(Number(req.params.id))
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
