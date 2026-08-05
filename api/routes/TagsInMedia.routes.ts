import type { ApiDb } from '../types/db'
import type { Express } from 'express'
import express from 'express'
import createTagsInMediaController from '../controllers/TagsInMedia.controller'
import { validateBody, validateQuery } from '../middleware/validateBody'
import {
  TagsInMediaBulkCreateRequestSchema,
  TagsInMediaCreateOneRequestSchema,
  TagsInMediaDeleteByMetaRequestSchema,
  TagsInMediaDeleteFromMediaRequestSchema,
  TagsInMediaQuerySchema,
} from '../../shared/schemas/requests'

export default function registerRoutes(app: Express, db: ApiDb) {
  const TagsInMedia = createTagsInMediaController(db)
  const router = express.Router()

  router.post('/', validateBody(TagsInMediaBulkCreateRequestSchema), TagsInMedia.bulkCreate)
  router.post('/createOne', validateBody(TagsInMediaCreateOneRequestSchema), TagsInMedia.create)
  router.get('/', validateQuery(TagsInMediaQuerySchema), TagsInMedia.findAll)
  router.post('/deleteFromMedia', validateBody(TagsInMediaDeleteFromMediaRequestSchema), TagsInMedia.deleteFromMedia)
  router.post('/deleteAllTagsByMetaId', validateBody(TagsInMediaDeleteByMetaRequestSchema), TagsInMedia.deleteAllTagsByMetaId)
  router.delete('/:id', TagsInMedia.deleteOne)

  app.use('/api/TagsInMedia', router)
}
