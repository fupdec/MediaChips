import type { ApiDb } from '../types/db'
import type { Express } from 'express'
import express from 'express'
import createSettingController from '../controllers/Setting.controller'
import { validateBody } from '../middleware/validateBody'
import { SettingUpdateRequestSchema } from '../../shared/schemas/requests'

export default function registerRoutes(app: Express, db: ApiDb) {
  const Setting = createSettingController(db)
  const router = express.Router()

  router.get('/', Setting.findAll)
  router.get('/:option', Setting.findOne)
  router.put('/:option', validateBody(SettingUpdateRequestSchema), Setting.update)

  app.use('/api/Setting', router)
}
