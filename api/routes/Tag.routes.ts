import type { ApiDb } from '../types/db'
import type { Express } from 'express'
import express from 'express'
import { validateBody } from '../middleware/validateBody'
import {
  CreateTagsRequestSchema,
  DeleteEntityOneRequestSchema,
  DuplicateTagRequestSchema,
  EntityUpdateRequestSchema,
  MergeTagsRequestSchema,
  MoveTagsToCategoryRequestSchema,
  TagItemsRequestSchema,
  TagThumbsRequestSchema,
} from '../../shared/schemas/requests'
import createTagController from '../controllers/Tag.controller'

export default function registerRoutes(app: Express, db: ApiDb) {
  const Tag = createTagController(db)
  const router = express.Router()

  router.post('/', validateBody(CreateTagsRequestSchema), Tag.create)
  router.get('/count', Tag.getCount)
  router.post('/thumbs', validateBody(TagThumbsRequestSchema), Tag.getThumbs)
  router.post('/merge', validateBody(MergeTagsRequestSchema), Tag.merge)
  router.post('/moveToCategory', validateBody(MoveTagsToCategoryRequestSchema), Tag.moveToCategory)
  router.post('/duplicate', validateBody(DuplicateTagRequestSchema), Tag.duplicate)
  router.get('/:id/cooccurring', Tag.getCooccurring)
  router.get('/:id/assignmentCounts', Tag.getAssignmentCounts)
  router.get('/:id', Tag.findOne)
  router.get('/', Tag.getAll)
  router.post('/items', validateBody(TagItemsRequestSchema), Tag.getAllForItems)
  router.put('/:id', validateBody(EntityUpdateRequestSchema), Tag.update)
  router.post('/deleteOne', validateBody(DeleteEntityOneRequestSchema), Tag.deleteOne)

  app.use('/api/Tag', router)
}
