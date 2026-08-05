import type { ApiDb } from '../types/db'
import type { Express } from 'express'
import express from 'express'
import createFilterRowController from '../controllers/FilterRow.controller'
import { validateBody } from '../middleware/validateBody'
import {
  FilterRowCreateRequestSchema,
  FilterRowUpdateRequestSchema,
} from '../../shared/schemas/requests'

export default function registerRoutes(app: Express, db: ApiDb) {
  const FilterRow = createFilterRowController(db)
  const router = express.Router()

  router.post('/', validateBody(FilterRowCreateRequestSchema), FilterRow.create)
  router.get('/:id', FilterRow.findOne)
  router.put('/:id', validateBody(FilterRowUpdateRequestSchema), FilterRow.update)
  router.delete('/:id', FilterRow.deleteOne)

  app.use('/api/FilterRow', router)
}
