import type { ApiDb } from '../types/db'
import type { Express } from 'express'
import express from 'express'
import createMediaTypeController from '../controllers/MediaType.controller'
import { validateBody } from '../middleware/validateBody'
import { MediaTypeWriteRequestSchema } from '../../shared/schemas/requests'

export default function registerRoutes(app: Express, db: ApiDb) {
  const MediaType = createMediaTypeController(db)
  const router = express.Router()

  router.post('/', validateBody(MediaTypeWriteRequestSchema), MediaType.create)
  router.get('/', MediaType.findAll)
  router.get('/:id', MediaType.findOne)
  router.put('/:id', validateBody(MediaTypeWriteRequestSchema), MediaType.update)
  router.delete('/:id', MediaType.deleteOne)

  app.use('/api/MediaType', router)
}
