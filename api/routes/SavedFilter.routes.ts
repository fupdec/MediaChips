import type { ApiDb } from '../types/db'
import type { Express } from 'express'
import express from 'express'
import createSavedFilterController from '../controllers/SavedFilter.controller'
import { validateBody } from '../middleware/validateBody'
import { SavedFilterWriteRequestSchema } from '../../shared/schemas/requests'

export default function registerRoutes(app: Express, db: ApiDb) {
  const SavedFilter = createSavedFilterController(db)
  const router = express.Router()

  router.post('/', validateBody(SavedFilterWriteRequestSchema), SavedFilter.create)
  router.get('/dynamicPlaylists/basic', SavedFilter.dynamicPlaylistsBasic)
  router.get('/dynamicPlaylists', SavedFilter.dynamicPlaylistsSummary)
  router.get('/:id/summary', SavedFilter.getPlaylistSummary)
  router.get('/:id/media', SavedFilter.getPlaylistMedia)
  router.get('/:id', SavedFilter.findOne)
  router.post('/findAll', validateBody(SavedFilterWriteRequestSchema), SavedFilter.findAll)
  router.post('/findAllHydrated', validateBody(SavedFilterWriteRequestSchema), SavedFilter.findAllHydrated)
  router.post('/findOrCreateHydrated', validateBody(SavedFilterWriteRequestSchema), SavedFilter.findOrCreateHydrated)
  router.put('/:id', validateBody(SavedFilterWriteRequestSchema), SavedFilter.update)
  router.delete('/:id', SavedFilter.deleteOne)

  app.use('/api/SavedFilter', router)
}
