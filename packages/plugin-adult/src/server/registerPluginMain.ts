import type {Express} from 'express'
import express from 'express'
import type {ApiDb} from '../../../../api/types/db'
import {validateBody} from '../../../../api/middleware/validateBody'
import {
  SceneMatchRequestSchema,
  SceneSearchRequestSchema,
  SceneMarkersApplyRequestSchema,
  SceneMarkersRequestSchema,
  CamGirlFinderSearchRequestSchema,
} from '../../../../shared/schemas/requests'
import createScraperController from './Scraper.controller'

/**
 * Entry used by `mainEntry` in the official adult zip.
 * Bundled to `main.cjs` and loaded from `{userData}/plugins/mediachips.adult/`.
 */
export default function registerAdultPluginMain(app: Express, db: ApiDb): void {
  const Scraper = createScraperController(db)
  const scraperRouter = express.Router()

  scraperRouter.get('/performers', Scraper.searchPerformers)
  scraperRouter.get('/scenes/status', Scraper.status)
  scraperRouter.post('/scenes/search', validateBody(SceneSearchRequestSchema), Scraper.searchScenes)
  scraperRouter.post('/scenes/match', validateBody(SceneMatchRequestSchema), Scraper.matchScenes)
  scraperRouter.post('/scenes/markers', validateBody(SceneMarkersRequestSchema), Scraper.getSceneMarkers)
  scraperRouter.post(
    '/scenes/markers/apply',
    validateBody(SceneMarkersApplyRequestSchema),
    Scraper.applySceneMarkers,
  )
  scraperRouter.post(
    '/camgirlfinder/search',
    validateBody(CamGirlFinderSearchRequestSchema),
    Scraper.searchCamGirlFinder,
  )

  app.use('/api/scraper', scraperRouter)
}
