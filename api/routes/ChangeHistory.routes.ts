import express, {type Express} from 'express'
import {z} from 'zod'
import type {ApiDb} from '../types/db'
import {validateBody, validateQuery} from '../middleware/validateBody'
import {HistoryConflict, historyDetails, listHistory, restoreHistory} from '../services/changeHistory'
import {invalidateMediaDerivedCaches} from '../services/mediaCacheInvalidation'
import {deleteMarkGeneratedAsset} from '../services/localAssetCleanup'

const page = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
const query = page.extend({entityType: z.enum(['media', 'tag', 'mark']).optional(), entityId: z.coerce.number().int().positive().optional()})

export default function registerChangeHistory(app: Express, db: ApiDb) {
  const router = express.Router()
  router.get('/', validateQuery(query), (req, res) => {
    const q = query.parse(req.query)
    res.json(listHistory(db.sqlite, q.limit, q.offset, q.entityType && q.entityId ? {type: q.entityType, id: q.entityId} : undefined))
  })
  router.get('/:operationId', validateQuery(page), (req, res) => {
    const q = page.parse(req.query)
    res.json(historyDetails(db.sqlite, String(req.params.operationId), q.limit, q.offset))
  })
  router.post('/:operationId/restore', validateBody(z.object({fieldId: z.number().int().positive().optional()})), (req, res) => {
    try {
      const result = restoreHistory(db.sqlite, String(req.params.operationId), req.body.fieldId)
      invalidateMediaDerivedCaches()
      if (db.path) for (const id of result.markIds) {
        try { deleteMarkGeneratedAsset(db.path, id) }
        catch (error) { console.warn('[history] Could not clear mark preview', id, error) }
      }
      res.json(result)
    } catch (error) {
      if (error instanceof HistoryConflict) res.status(409).json({message: error.message})
      else throw error
    }
  })
  app.use('/api/change-history', router)
}
