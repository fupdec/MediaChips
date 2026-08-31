import type { ApiDb } from '../types/db'
import type { Express } from 'express'
import express from 'express'
import createPlaylistController from '../controllers/Playlist.controller'
import { validateBody, validateQuery } from '../middleware/validateBody'
import {
  MediaTrashIdsRequestSchema,
  MediaTrashListQuerySchema,
  PlaylistWriteRequestSchema,
} from '../../shared/schemas/requests'

export default function registerRoutes(app: Express, db: ApiDb) {
  const Playlist = createPlaylistController(db)
  const router = express.Router()

  router.post('/', validateBody(PlaylistWriteRequestSchema), Playlist.create)
  router.get('/trash', validateQuery(MediaTrashListQuerySchema), Playlist.listTrash)
  router.post('/trash/restore', validateBody(MediaTrashIdsRequestSchema), Playlist.restoreTrash)
  router.post('/trash/purge', validateBody(MediaTrashIdsRequestSchema), Playlist.purgeTrash)
  router.post('/trash/purgeExpired', Playlist.purgeExpiredTrash)
  router.get('/', Playlist.findAll)
  router.get('/summary', Playlist.findSummary)
  router.put('/:id', validateBody(PlaylistWriteRequestSchema), Playlist.update)
  router.delete('/:id', Playlist.deleteOne)

  app.use('/api/Playlist', router)
}
