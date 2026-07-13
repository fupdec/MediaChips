import type { ApiDb } from '../types/db'
import type { Express } from 'express'
import express from 'express'
import { validateBody } from '../middleware/validateBody'
import { SceneMatchRequestSchema, SceneSearchRequestSchema } from '../../shared/schemas/requests'
import createScraperController from '../controllers/Scraper.controller'

export default function registerRoutes(app: Express, db: ApiDb) {
  const Scraper = createScraperController(db)
  const router = express.Router()

  router.get('/scenes/status', Scraper.status)
  router.post('/scenes/search', validateBody(SceneSearchRequestSchema), Scraper.searchScenes)
  router.post('/scenes/match', validateBody(SceneMatchRequestSchema), Scraper.matchScenes)

  app.use('/api/scraper', router)
}
