import type {ApiDb} from '../types/db'
import type {Express} from 'express'
import express from 'express'
import {validateBody} from '../middleware/validateBody'
import {
  ImportFromPlexRequestSchema,
  ListPlexLibrariesRequestSchema,
} from '../../shared/schemas/requests'
import createImportFromPlexController from '../plugins/plex/ImportFromPlex.controller'

export default function registerRoutes(app: Express, db: ApiDb) {
  const controller = createImportFromPlexController(db)
  const router = express.Router()

  router.post(
    '/listLibraries',
    validateBody(ListPlexLibrariesRequestSchema),
    controller.listLibraries,
  )
  router.post(
    '/streamImport',
    validateBody(ImportFromPlexRequestSchema),
    controller.streamImportFromPlex,
  )

  app.use('/api/plex', router)
}
