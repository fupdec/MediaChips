import type { ApiDb } from '../types/db'
import type { Express } from 'express'
import express from 'express'
import createTagsInTagController from '../controllers/TagsInTag.controller'
import { validateBody, validateQuery } from '../middleware/validateBody'
import {
  TagsInTagBulkCreateRequestSchema,
  TagsInTagDeleteByMetaRequestSchema,
  TagsInTagDeleteFromTagRequestSchema,
  TagsInTagLinkSchema,
  TagsInTagQuerySchema,
} from '../../shared/schemas/requests'

export default function registerRoutes(app: Express, db: ApiDb) {
  const TagsInTag = createTagsInTagController(db)
  const router = express.Router()

  router.post('/', validateBody(TagsInTagBulkCreateRequestSchema), TagsInTag.bulkCreate)
  router.post('/createOne', validateBody(TagsInTagLinkSchema), TagsInTag.create)
  router.get('/', validateQuery(TagsInTagQuerySchema), TagsInTag.findAll)
  router.delete('/:id', TagsInTag.deleteOne)
  router.post('/deleteAllTagsByMetaId', validateBody(TagsInTagDeleteByMetaRequestSchema), TagsInTag.deleteAllTagsByMetaId)
  router.post('/deleteFromTag', validateBody(TagsInTagDeleteFromTagRequestSchema), TagsInTag.deleteFromTag)

  app.use('/api/TagsInTag', router)
}
