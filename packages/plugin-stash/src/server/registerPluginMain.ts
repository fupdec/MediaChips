import type {Express} from 'express'
import express from 'express'
import type {ApiDb} from '../../../../api/types/db'
import {validateBody} from '../../../../api/middleware/validateBody'
import {ImportFromStashRequestSchema} from '../../../../shared/schemas/requests'
import createImportFromStashController from './ImportFromStash.controller'

/**
 * Entry used by `mainEntry` in the official stash zip.
 * Bundled to `main.cjs` and loaded from `{userData}/plugins/mediachips.stash/`.
 */
export default function registerStashPluginMain(app: Express, db: ApiDb): void {
  const ImportFromStash = createImportFromStashController(db)
  const router = express.Router()

  router.post(
    '/streamImport',
    validateBody(ImportFromStashRequestSchema),
    ImportFromStash.streamImportFromStash,
  )

  app.use('/api/stash', router)
}
