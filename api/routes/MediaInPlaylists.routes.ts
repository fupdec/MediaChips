import type { ApiDb } from '../types/db'
import type { Express } from 'express'
import express from 'express'
import createMediaInPlaylistsController from '../controllers/MediaInPlaylists.controller'
import { validateBody } from '../middleware/validateBody'
import {
  MediaInPlaylistCreateRequestSchema,
  MediaInPlaylistsDeleteRequestSchema,
  MediaInPlaylistsUpdateRequestSchema,
} from '../../shared/schemas/requests'

export default function registerRoutes(app: Express, db: ApiDb) {
  const MediaInPlaylists = createMediaInPlaylistsController(db)
  const router = express.Router()

  router.post('/', validateBody(MediaInPlaylistCreateRequestSchema), MediaInPlaylists.create)
  router.post('/update', validateBody(MediaInPlaylistsUpdateRequestSchema), MediaInPlaylists.update)
  router.get('/:id', MediaInPlaylists.findAll)
  router.delete('/', validateBody(MediaInPlaylistsDeleteRequestSchema), MediaInPlaylists.deleteOne)

  app.use('/api/MediaInPlaylists', router)
}
