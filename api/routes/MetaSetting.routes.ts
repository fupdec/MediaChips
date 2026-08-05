import type { ApiDb } from '../types/db'
import type { Express } from 'express'
import express from 'express'
import createMetaSettingController from '../controllers/MetaSetting.controller'
import { validateBody } from '../middleware/validateBody'
import { MetaSettingUpdateRequestSchema } from '../../shared/schemas/requests'

export default function registerRoutes(app: Express, db: ApiDb) {
  const MetaSetting = createMetaSettingController(db)
  const router = express.Router()

  router.get('/:id', MetaSetting.findOne)
  router.put('/:id', validateBody(MetaSettingUpdateRequestSchema), MetaSetting.update)

  app.use('/api/MetaSetting', router)
}
