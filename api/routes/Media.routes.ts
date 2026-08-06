import type { ApiDb } from '../types/db'
import type { Express } from 'express'

import express from 'express'
import { validateBody, validateQuery } from '../middleware/validateBody'
import {
  ItemsListRequestSchema,
  MediaIdsRequestSchema,
  MediaBasicsRequestSchema,
  MediaSimilarByVisualRequestSchema,
  MediaDuplicateGroupsRequestSchema,
  MergeMediaRequestSchema,
  MediaThumbsRequestSchema,
  MediaPathUpdateRequestSchema,
  DeleteEntityOneRequestSchema,
  MediaTagCountQuerySchema,
  EntityUpdateRequestSchema,
} from '../../shared/schemas/requests'
import createMediaController from '../controllers/Media.controller'

export default function registerRoutes(app: Express, db: ApiDb) {
  const Media = createMediaController(db)
  const router = express.Router()

  router.get('/numberOfMediaWithTag', validateQuery(MediaTagCountQuerySchema), Media.numberOfMediaWithTag)

  router.post('/items', validateBody(ItemsListRequestSchema), Media.getAll)
  router.post('/ids', validateBody(MediaIdsRequestSchema), Media.getFilteredIds)
  router.post('/basics', validateBody(MediaBasicsRequestSchema), Media.getBasicsByIds)
  router.post('/thumbs', validateBody(MediaThumbsRequestSchema), Media.getThumbs)
  router.post('/similarByVisual', validateBody(MediaSimilarByVisualRequestSchema), Media.similarByVisual)
  router.post('/duplicateGroups', validateBody(MediaDuplicateGroupsRequestSchema), Media.duplicateGroups)
  router.post('/merge', validateBody(MergeMediaRequestSchema), Media.merge)

  router.get('/get-stats', Media.getStats)

  router.post('/updatePath', validateBody(MediaPathUpdateRequestSchema), Media.updatePath)

  router.put('/:id', validateBody(EntityUpdateRequestSchema), Media.update)

  router.get('/:id', Media.getOneById)

  router.post('/deleteOne', validateBody(DeleteEntityOneRequestSchema), Media.deleteOne)

  app.use('/api/Media', router)
}
