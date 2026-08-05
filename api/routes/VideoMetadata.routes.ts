import type { ApiDb } from '../types/db'
import type { Express } from 'express'
import express from 'express'
import createVideoMetadataController from '../controllers/VideoMetadata.controller'
import { validateBody } from '../middleware/validateBody'
import { VideoMetadataUpdateRequestSchema } from '../../shared/schemas/requests'

export default function registerRoutes(app: Express, db: ApiDb) {
  const VideoMetadata = createVideoMetadataController(db)
  const router = express.Router()

  router.get('/:id', VideoMetadata.findOne)
  router.put('/:id', validateBody(VideoMetadataUpdateRequestSchema), VideoMetadata.update)

  app.use('/api/VideoMetadata', router)
}
