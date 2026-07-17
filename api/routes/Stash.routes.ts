import type { ApiDb } from '../types/db'
import type { Express } from 'express'
import express from 'express'
import { validateBody } from '../middleware/validateBody'
import { ImportFromStashRequestSchema } from '../../shared/schemas/requests'
import createImportFromStashController from '../plugins/stash/ImportFromStash.controller'

export default function registerRoutes(app: Express, db: ApiDb) {
  const ImportFromStash = createImportFromStashController(db)
  const router = express.Router()

  router.post(
    '/streamImport',
    validateBody(ImportFromStashRequestSchema),
    ImportFromStash.streamImportFromStash,
  )

  app.use('/api/stash', router)
}
