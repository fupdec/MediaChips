import type {Express} from 'express'
import express from 'express'
import type {ApiDb} from '../../../../api/types/db'
import {validateBody} from '../../../../api/middleware/validateBody'
import {
  ImportFromJellyfinRequestSchema,
  ListJellyfinLibrariesRequestSchema,
} from '../../../../shared/schemas/requests'
import createImportFromJellyfinController from './ImportFromJellyfin.controller'

/**
 * Entry used by `mainEntry` in the official jellyfin zip.
 * Bundled to `main.cjs` and loaded from `{userData}/plugins/mediachips.jellyfin/`.
 */
export default function registerJellyfinPluginMain(app: Express, db: ApiDb): void {
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
