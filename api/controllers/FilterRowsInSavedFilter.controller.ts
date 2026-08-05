import type { ApiDb } from '../types/db'
import { sendControllerError } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'

import { createFilterRowsInSavedFiltersRepository } from '../db/repositories/filterRowsInSavedFilters'
export default function (db: ApiDb) {
  const filterRowsInSavedFiltersRepo = createFilterRowsInSavedFiltersRepository(db.drizzle)

  const findAll = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = filterRowsInSavedFiltersRepo.findByFilterId(Number(req.query.filterId))
      res.status(201).send(data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  return {
    findAll,
  }
}
