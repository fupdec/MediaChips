import type { ApiDb } from '../types/db'
import type { Express } from 'express'
import express from 'express'
import createValuesInMediaController from '../controllers/ValuesInMedia.controller'
import { validateBody, validateQuery } from '../middleware/validateBody'
import {
  ValuesInMediaBulkCreateRequestSchema,
  ValuesInMediaDeleteRequestSchema,
  ValuesInMediaQuerySchema,
} from '../../shared/schemas/requests'

export default function registerRoutes(app: Express, db: ApiDb) {
  const ValuesInMedia = createValuesInMediaController(db)
  const router = express.Router()

  router.post('/', validateBody(ValuesInMediaBulkCreateRequestSchema), ValuesInMedia.create)
  router.get('/', validateQuery(ValuesInMediaQuerySchema), ValuesInMedia.findAll)
  router.post('/delete', validateBody(ValuesInMediaDeleteRequestSchema), ValuesInMedia.deleteOne)
  router.delete('/:id', ValuesInMedia.deleteAllValuesByMediaId)

  app.use('/api/ValuesInMedia', router)
}
