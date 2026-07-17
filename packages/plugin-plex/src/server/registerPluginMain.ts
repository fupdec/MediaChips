import type {Express} from 'express'
import express from 'express'
import type {ApiDb} from '../../../../api/types/db'
import {validateBody} from '../../../../api/middleware/validateBody'
import {
  ImportFromPlexRequestSchema,
  ListPlexLibrariesRequestSchema,
} from '../../../../shared/schemas/requests'
import createImportFromPlexController from './ImportFromPlex.controller'

/**
 * Entry used by `mainEntry` in the official plex zip.
 * Bundled to `main.cjs` and loaded from `{userData}/plugins/mediachips.plex/`.
 */
export default function registerPlexPluginMain(app: Express, db: ApiDb): void {
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
