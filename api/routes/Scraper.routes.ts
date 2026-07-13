import type { ApiDb } from '../types/db'
import type { Express } from 'express'
import express from 'express'
import { validateBody } from '../middleware/validateBody'
import {
  SceneMatchRequestSchema,
  SceneSearchRequestSchema,
  SceneMarkersApplyRequestSchema,
  SceneMarkersRequestSchema,
} from '../../shared/schemas/requests'
import createScraperController from '../plugins/adult/Scraper.controller'

export default function registerRoutes(app: Express, db: ApiDb) {
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
