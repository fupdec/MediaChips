import type { ApiDb } from '../types/db'
import type { Express } from 'express'

import express from 'express'
import {  validateBody, validateQuery  } from '../middleware/validateBody'
import { 
  GlobalSearchRequestSchema,
  HomeMediaQuerySchema,
  HomeMarkersQuerySchema,
 } from '../../shared/schemas/requests'
import createHomeController from '../controllers/Home.controller'



export default function registerRoutes(app: Express, db: ApiDb) {
  const Home = createHomeController(db)
  const router = express.Router()

  router.get('/media', validateQuery(HomeMediaQuerySchema), Home.getMedia)
  router.get('/markers', validateQuery(HomeMarkersQuerySchema), Home.getMarkers)
  router.get('/health', Home.getHealth)
  router.get('/health-lite', Home.getHealthLite)
  router.get('/extended-stats', Home.getExtendedStats)
  router.post('/search', validateBody(GlobalSearchRequestSchema), Home.searchGlobal)
  router.post('/search/media', validateBody(GlobalSearchRequestSchema), Home.searchMedia)
  router.post('/search/tags', validateBody(GlobalSearchRequestSchema), Home.searchTags)

  app.use('/api/home', router)
}
