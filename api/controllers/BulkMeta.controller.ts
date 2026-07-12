import type { ApiDb } from '../types/db'
import { apiErrorMessage } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'
import { applyBulkMetaEdit } from '../services/bulkMetaEdit'
import { invalidateMediaDerivedCaches } from '../services/mediaCacheInvalidation'

export default function createBulkMetaController(db: ApiDb) {
  const apply = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const { itemType, itemIds, changes, presetChanges } = req.body

      const result = await applyBulkMetaEdit(db, {
        itemType,
        itemIds,
        changes,
        presetChanges,
      })

      invalidateMediaDerivedCaches()
      res.status(201).send(result)
    } catch (err) {
      res.status(500).send({
        message: apiErrorMessage(err) || 'Some error occurred while applying bulk edits.',
      })
    }
  }

  return {apply}
}
