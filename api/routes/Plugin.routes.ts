import type {ApiDb} from '../types/db'
import type {Express} from 'express'
import express from 'express'
import createPluginController from '../controllers/Plugin.controller'
import {validateBody} from '../middleware/validateBody'
import {PathPayloadSchema, PluginUninstallRequestSchema} from '../../shared/schemas/requests'

export default function registerRoutes(app: Express, db: ApiDb) {
  const Plugin = createPluginController(db)
  const router = express.Router()

  router.get('/', Plugin.list)
  router.post('/install', validateBody(PathPayloadSchema), Plugin.install)
  router.post('/uninstall', validateBody(PluginUninstallRequestSchema), Plugin.uninstall)

  app.use('/api/Plugin', router)
}
