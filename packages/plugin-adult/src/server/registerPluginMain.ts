import type {Express} from 'express'
import express from 'express'
import type {ApiDb} from '../../../../api/types/db'
import {validateBody} from '../../../../api/middleware/validateBody'
import {
  SceneMatchRequestSchema,
  SceneSearchRequestSchema,
  SceneMarkersApplyRequestSchema,
  SceneMarkersRequestSchema,
} from '../../../../shared/schemas/requests'
import createScraperController from './Scraper.controller'

/**
 * Entry used by `mainEntry` in the official adult zip.
 * Bundled to `main.cjs` and loaded from `{userData}/plugins/mediachips.adult/`.
 */
export default function registerAdultPluginMain(app: Express, db: ApiDb): void {
  const Scraper = createScraperController(db)
  const router = express.Router()

  router.get('/performers', Scraper.searchPerformers)
  router.get('/scenes/status', Scraper.status)
  router.post('/scenes/search', validateBody(SceneSearchRequestSchema), Scraper.searchScenes)
  router.post('/scenes/match', validateBody(SceneMatchRequestSchema), Scraper.matchScenes)
  router.post('/scenes/markers', validateBody(SceneMarkersRequestSchema), Scraper.getSceneMarkers)
  router.post('/scenes/markers/apply', validateBody(SceneMarkersApplyRequestSchema), Scraper.applySceneMarkers)

  app.use('/api/scraper', router)
}
