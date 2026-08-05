import type { ApiDb } from '../types/db'
import type { Express } from 'express'
import express from 'express'
import createFilterRowsInSavedFilterController from '../controllers/FilterRowsInSavedFilter.controller'
import { validateQuery } from '../middleware/validateBody'
import { FilterRowsInSavedFilterQuerySchema } from '../../shared/schemas/requests'

export default function registerRoutes(app: Express, db: ApiDb) {
  const FilterRowsInSavedFilter = createFilterRowsInSavedFilterController(db)
  const router = express.Router()

  router.get('/', validateQuery(FilterRowsInSavedFilterQuerySchema), FilterRowsInSavedFilter.findAll)

  app.use('/api/FilterRowsInSavedFilter', router)
}
