import type {ApiDb} from '../types/db'
import type {Express} from 'express'
import express from 'express'
import {validateBody} from '../middleware/validateBody'
import {TmdbSearchRequestSchema} from '../../shared/schemas/requests'
import createTmdbController from '../plugins/tmdb/Tmdb.controller'

export default function registerRoutes(app: Express, db: ApiDb) {
  const controller = createTmdbController(db)
  const router = express.Router()

  router.get('/status', controller.status)
  router.post('/search', validateBody(TmdbSearchRequestSchema), controller.search)
  router.get('/movie/:id', controller.movie)
  router.get('/title/:mediaType/:id', controller.title)
  router.get('/find/imdb/:imdbId', controller.findImdb)
  router.post('/person/search', validateBody(TmdbSearchRequestSchema), controller.searchPeople)
  router.get('/person/:id', controller.person)

  app.use('/api/tmdb', router)
}
