import type { ApiDb } from '../types/db'
import type { Express } from 'express'
import express from 'express'
import { validateBody } from '../middleware/validateBody'
import {
  EmptyObjectRequestSchema,
  MergeCategoriesRequestSchema,
  MetaWriteRequestSchema,
} from '../../shared/schemas/requests'
import createMetaController from '../controllers/Meta.controller'

export default function registerRoutes(app: Express, db: ApiDb) {
  const Meta = createMetaController(db)
  const router = express.Router()

  router.post('/', validateBody(MetaWriteRequestSchema), Meta.create)
  router.get('/', Meta.findAll)
  router.post('/mergeCategories', validateBody(MergeCategoriesRequestSchema), Meta.mergeCategories)
  router.get('/:id', Meta.findOne)
  router.post('/latest', validateBody(EmptyObjectRequestSchema), Meta.findLatest)
  router.put('/:id', validateBody(MetaWriteRequestSchema), Meta.update)
  router.delete('/:id', Meta.deleteOne)

  app.use('/api/Meta', router)
}
