import type { ApiDb, AnyRecord } from '../types/db'
import { apiErrorMessage } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'

import { createFilterRowsRepository } from '../db/repositories/filterRows'
import { createFilterRowsInSavedFiltersRepository } from '../db/repositories/filterRowsInSavedFilters'
import { createTagsInFilterRowsRepository } from '../db/repositories/tagsInFilterRows'
import { serializeCountries } from '../utils/country'
import { normalizeMetaIdParam, resolveMetaId } from '../utils/metaId'
import { serializeExtList } from '../utils/ext'
import { invalidateMediaDerivedCaches } from '../services/mediaCacheInvalidation'

export default function (db: ApiDb) {
  const filterRowsRepo = createFilterRowsRepository(db.drizzle)
  const filterRowsInSavedFiltersRepo = createFilterRowsInSavedFiltersRepository(db.drizzle)
  const tagsInFilterRowsRepo = createTagsInFilterRowsRepository(db.drizzle)

  const create = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const filterObj = {...req.body.filter}
      const val = filterObj.val
      const rowId = req.body.rowId || null
      const filterId = req.body.filterId

      if (filterObj.type == 'array' && filterObj.param !== 'country' && filterObj.param !== 'ext') {
        filterObj.val = null
      }
      if (filterObj.param == 'country' && val) {
        filterObj.val = serializeCountries(val)
      }
      if (filterObj.param == 'ext' && val) {
        filterObj.val = serializeExtList(val)
      }

      const allowedFields = ['param', 'type', 'cond', 'val', 'active', 'note', 'lock', 'order']
      const payload: AnyRecord = {}
      for (const key of allowedFields) {
        if (Object.prototype.hasOwnProperty.call(filterObj, key)) {
          payload[key] = filterObj[key]
        }
      }

      if (payload.param != null) {
        payload.param = normalizeMetaIdParam(payload.param)
      }

      let filterRow

      if (rowId) {
        const existing = filterRowsRepo.findById(Number(rowId))
        if (existing) {
          filterRow = filterRowsRepo.updateById(Number(rowId), payload)
        } else {
          filterRow = filterRowsRepo.create(payload)
        }
      } else {
        filterRow = filterRowsRepo.create(payload)
      }

      if (filterId) {
        filterRowsInSavedFiltersRepo.findOrCreate(Number(filterId), Number(filterRow.id))
      }

      if (filterObj.type == 'array' && filterObj.param !== 'country' && filterObj.param !== 'ext') {
        tagsInFilterRowsRepo.deleteByRowId(Number(filterRow.id))

        if (filterObj.cond?.includes('null') === false && val !== undefined && val !== null && val !== '') {
          const metaId = resolveMetaId(filterRow.param)
          for (const tagId of val) {
            tagsInFilterRowsRepo.findOrCreate(
              Number(tagId),
              Number(filterRow.id),
              Number(metaId ?? filterRow.param),
            )
          }
        }
      }

      res.status(201).send(filterRow)
      invalidateMediaDerivedCaches()
    } catch (err) {
      console.log(err)
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while performing query."
      })
    }
  };

  const findOne = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = filterRowsRepo.findById(Number(req.params.id)) ?? null
      res.status(201).send(data)
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while performing query."
      })
    }
  };

  const update = function (req: ApiRequest, res: ApiResponse) {
    try {
      filterRowsRepo.updateById(Number(req.params.id), req.body)
      invalidateMediaDerivedCaches()
      res.sendStatus(201)
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while performing query."
      })
    }
  };

  const deleteOne = function (req: ApiRequest, res: ApiResponse) {
    try {
      filterRowsRepo.deleteById(Number(req.params.id))
      invalidateMediaDerivedCaches()
      res.sendStatus(201)
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while performing query."
      })
    }
  };

  return {
    create,
    findOne,
    update,
    deleteOne
  }
}
