import type { ApiDb } from '../types/db'
import type { Express } from 'express'
import express from 'express'
import createPinnedMetaController from '../controllers/PinnedMeta.controller'
import { validateBody, validateQuery } from '../middleware/validateBody'
import {
  PinChildMetaRequestSchema,
  PinnedMetaDeleteQuerySchema,
  PinnedMetaFindQuerySchema,
  PinnedMetaOrderRequestSchema,
} from '../../shared/schemas/requests'

export default function registerRoutes(app: Express, db: ApiDb) {
  const PinnedMeta = createPinnedMetaController(db)
  const router = express.Router()

  router.post('/', validateBody(PinChildMetaRequestSchema), PinnedMeta.create)
  router.get('/', validateQuery(PinnedMetaFindQuerySchema), PinnedMeta.findAll)
  router.put('/', validateBody(PinnedMetaOrderRequestSchema), PinnedMeta.update)
  router.delete('/:id', validateQuery(PinnedMetaDeleteQuerySchema), PinnedMeta.deleteOne)

  app.use('/api/PinnedMeta', router)
}
