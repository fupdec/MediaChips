import type { ApiDb } from '../types/db'
import type { Express } from 'express'
import express from 'express'
import createWatchedFolderController from '../controllers/WatchedFolder.controller'
import { validateBody } from '../middleware/validateBody'
import {
  WatchedFolderAssessRequestSchema,
  WatchedFolderCreateRequestSchema,
  WatchedFolderUpdateRequestSchema,
} from '../../shared/schemas/requests'

export default function registerRoutes(app: Express, db: ApiDb) {
  const WatchedFolder = createWatchedFolderController(db)
  const router = express.Router()

  router.post('/assess', validateBody(WatchedFolderAssessRequestSchema), WatchedFolder.assess)
  router.post('/', validateBody(WatchedFolderCreateRequestSchema), WatchedFolder.create)
  router.put('/:id', validateBody(WatchedFolderUpdateRequestSchema), WatchedFolder.update)
  router.delete('/:id', WatchedFolder.deleteOne)

  app.use('/api/WatchedFolder', router)
}
