import type {ApiDb} from '../types/db'
import type {Express} from 'express'
import express from 'express'
import {validateBody} from '../middleware/validateBody'
import {
  LibraryResetMediaRequestSchema,
  LibraryResetTagsRequestSchema,
} from '../../shared/schemas/requests'
import createLibraryResetController from '../controllers/LibraryReset.controller'

export default function registerRoutes(app: Express, db: ApiDb) {
  const LibraryReset = createLibraryResetController(db)
  const router = express.Router()

  router.get('/counts', LibraryReset.getCounts)
  router.post('/media', validateBody(LibraryResetMediaRequestSchema), LibraryReset.resetMedia)
  router.post('/tags', validateBody(LibraryResetTagsRequestSchema), LibraryReset.resetTags)

  app.use('/api/LibraryReset', router)
}
