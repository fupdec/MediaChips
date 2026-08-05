import type { ApiDb } from '../types/db'
import type { Express } from 'express'
import express from 'express'
import createValuesInTagController from '../controllers/ValuesInTag.controller'
import { validateBody, validateQuery } from '../middleware/validateBody'
import {
  ValuesInTagBulkCreateRequestSchema,
  ValuesInTagDeleteRequestSchema,
  ValuesInTagQuerySchema,
} from '../../shared/schemas/requests'

export default function registerRoutes(app: Express, db: ApiDb) {
  const ValuesInTag = createValuesInTagController(db)
  const router = express.Router()

  router.post('/', validateBody(ValuesInTagBulkCreateRequestSchema), ValuesInTag.create)
  router.get('/', validateQuery(ValuesInTagQuerySchema), ValuesInTag.findAll)
  router.post('/delete', validateBody(ValuesInTagDeleteRequestSchema), ValuesInTag.deleteOne)
  router.delete('/:id', ValuesInTag.deleteAllValuesByTagId)

  app.use('/api/ValuesInTag', router)
}
