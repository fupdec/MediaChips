import type {ApiDb} from '../types/db'
import type {Express} from 'express'
import express from 'express'
import {validateBody} from '../middleware/validateBody'
import {
  ImportFromEmbyRequestSchema,
  ListEmbyLibrariesRequestSchema,
} from '../../shared/schemas/requests'
import createImportFromEmbyController from '../plugins/emby/ImportFromEmby.controller'

export default function registerRoutes(app: Express, db: ApiDb) {
  const controller = createImportFromEmbyController(db)
  const router = express.Router()

  router.post(
    '/listLibraries',
    validateBody(ListEmbyLibrariesRequestSchema),
    controller.listLibraries,
  )
  router.post(
    '/streamImport',
    validateBody(ImportFromEmbyRequestSchema),
    controller.streamImportFromJellyfin,
  )

  app.use('/api/emby', router)
}
