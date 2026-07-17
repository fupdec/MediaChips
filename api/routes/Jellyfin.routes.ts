import type {ApiDb} from '../types/db'
import type {Express} from 'express'
import express from 'express'
import {validateBody} from '../middleware/validateBody'
import {
  ImportFromJellyfinRequestSchema,
  ListJellyfinLibrariesRequestSchema,
} from '../../shared/schemas/requests'
import createImportFromJellyfinController from '../plugins/jellyfin/ImportFromJellyfin.controller'

export default function registerRoutes(app: Express, db: ApiDb) {
  const controller = createImportFromJellyfinController(db)
  const router = express.Router()

  router.post(
    '/listLibraries',
    validateBody(ListJellyfinLibrariesRequestSchema),
    controller.listLibraries,
  )
  router.post(
    '/streamImport',
    validateBody(ImportFromJellyfinRequestSchema),
    controller.streamImportFromJellyfin,
  )

  app.use('/api/jellyfin', router)
}
