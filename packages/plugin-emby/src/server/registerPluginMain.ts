import type {Express} from 'express'
import express from 'express'
import type {ApiDb} from '../../../../api/types/db'
import {validateBody} from '../../../../api/middleware/validateBody'
import {
  ImportFromEmbyRequestSchema,
  ListEmbyLibrariesRequestSchema,
} from '../../../../shared/schemas/requests'
import createImportFromEmbyController from './ImportFromEmby.controller'

/**
 * Entry used by `mainEntry` in the official emby zip.
 * Bundled to `main.cjs` and loaded from `{userData}/plugins/mediachips.emby/`.
 */
export default function registerEmbyPluginMain(app: Express, db: ApiDb): void {
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
