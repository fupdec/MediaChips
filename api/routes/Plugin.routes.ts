import type {ApiDb} from '../types/db'
import type {Express} from 'express'
import express from 'express'
import createPluginController from '../controllers/Plugin.controller'

export default function registerRoutes(app: Express, db: ApiDb) {
  const Plugin = createPluginController(db)
  const router = express.Router()

  router.get('/', Plugin.list)
  router.post('/install', Plugin.install)
  router.post('/uninstall', Plugin.uninstall)

  app.use('/api/Plugin', router)
}
