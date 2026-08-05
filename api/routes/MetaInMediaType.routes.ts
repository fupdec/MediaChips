import type { ApiDb } from '../types/db'
import type { Express } from 'express'
import express from 'express'
import createMetaInMediaTypeController from '../controllers/MetaInMediaType.controller'
import { validateBody, validateQuery } from '../middleware/validateBody'
import {
  MetaInMediaTypeDeleteQuerySchema,
  MetaInMediaTypeFindQuerySchema,
  MetaInMediaTypeOrderRequestSchema,
  PinMetaAssignmentRequestSchema,
} from '../../shared/schemas/requests'

export default function registerRoutes(app: Express, db: ApiDb) {
  const MetaInMediaType = createMetaInMediaTypeController(db)
  const router = express.Router()

  router.post('/', validateBody(PinMetaAssignmentRequestSchema), MetaInMediaType.create)
  router.get('/', validateQuery(MetaInMediaTypeFindQuerySchema), MetaInMediaType.findAll)
  router.put('/', validateBody(MetaInMediaTypeOrderRequestSchema), MetaInMediaType.update)
  router.delete('/', validateQuery(MetaInMediaTypeDeleteQuerySchema), MetaInMediaType.deleteOne)

  app.use('/api/MetaInMediaType', router)
}
