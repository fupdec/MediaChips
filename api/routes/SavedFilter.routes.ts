import type { ApiDb } from '../types/db'
import type { Express } from 'express'
import express from 'express'
import createSavedFilterController from '../controllers/SavedFilter.controller'
import { validateBody, validateQuery } from '../middleware/validateBody'
import {
  MediaTrashIdsRequestSchema,
  MediaTrashListQuerySchema,
  SavedFilterWriteRequestSchema,
} from '../../shared/schemas/requests'

export default function registerRoutes(app: Express, db: ApiDb) {
  const SavedFilter = createSavedFilterController(db)
  const router = express.Router()

  router.post('/', validateBody(SavedFilterWriteRequestSchema), SavedFilter.create)
  router.get('/trash', validateQuery(MediaTrashListQuerySchema), SavedFilter.listTrash)
  router.post('/trash/restore', validateBody(MediaTrashIdsRequestSchema), SavedFilter.restoreTrash)
  router.post('/trash/purge', validateBody(MediaTrashIdsRequestSchema), SavedFilter.purgeTrash)
  router.post('/trash/purgeExpired', SavedFilter.purgeExpiredTrash)
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
