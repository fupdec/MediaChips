import type { ApiDb } from '../types/db'
import type { Express } from 'express'

import express from 'express'
import { validateBody, validateQuery } from '../middleware/validateBody'
import {
  ItemsListRequestSchema,
  MarkClipsRequestSchema,
  MarkCreateRequestSchema,
  MediaTrashIdsRequestSchema,
  MediaTrashListQuerySchema,
  PathPayloadSchema,
} from '../../shared/schemas/requests'
import createMarkController from '../controllers/Mark.controller'

export default function registerRoutes(app: Express, db: ApiDb) {
  const Mark = createMarkController(db)
  const router = express.Router()

  router.post('/', validateBody(MarkCreateRequestSchema), Mark.create)
  router.put('/:id', validateBody(MarkCreateRequestSchema), Mark.updateOne)
  router.get('/video/:id', Mark.findAllForVideo)
  router.post('/by-path', validateBody(PathPayloadSchema), Mark.findChaptersByPath)
  router.get('/trash', validateQuery(MediaTrashListQuerySchema), Mark.listTrash)
  router.post('/trash/restore', validateBody(MediaTrashIdsRequestSchema), Mark.restoreTrash)
  router.post('/trash/purge', validateBody(MediaTrashIdsRequestSchema), Mark.purgeTrash)
  router.post('/trash/purgeExpired', Mark.purgeExpiredTrash)
  router.get('/', Mark.findAll)
  router.post('/items', validateBody(ItemsListRequestSchema), Mark.getItems)
  router.post('/clips', validateBody(MarkClipsRequestSchema), Mark.getClips)
  router.get('/filter-metas', Mark.getFilterMetas)
  router.delete('/:id', Mark.deleteOne)

  app.use('/api/Mark', router)
}
