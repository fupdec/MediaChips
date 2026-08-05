import type { ApiDb } from '../types/db'
import type { Express } from 'express'
import express from 'express'
import createTagsInFilterRowController from '../controllers/TagsInFilterRow.controller'
import { validateQuery } from '../middleware/validateBody'
import { TagsInFilterRowQuerySchema } from '../../shared/schemas/requests'

export default function registerRoutes(app: Express, db: ApiDb) {
  const TagsInFilterRow = createTagsInFilterRowController(db)
  const router = express.Router()

  router.get('/', validateQuery(TagsInFilterRowQuerySchema), TagsInFilterRow.findAll)

  app.use('/api/TagsInFilterRow', router)
}
