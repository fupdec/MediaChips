import type { ApiDb } from '../types/db'
import type { Express } from 'express'
import express from 'express'
import createPageSettingController from '../controllers/PageSetting.controller'
import { validateBody, validateQuery } from '../middleware/validateBody'
import {
  PageSettingCreateRequestSchema,
  PageSettingFindQuerySchema,
  PageSettingUpdateRequestSchema,
} from '../../shared/schemas/requests'

export default function registerRoutes(app: Express, db: ApiDb) {
  const PageSetting = createPageSettingController(db)
  const router = express.Router()

  router.post('/', validateBody(PageSettingCreateRequestSchema), PageSetting.create)
  router.post('/find', validateBody(PageSettingCreateRequestSchema), PageSetting.find)
  router.get('/', validateQuery(PageSettingFindQuerySchema), PageSetting.findOne)
  router.put('/', validateBody(PageSettingUpdateRequestSchema), PageSetting.update)

  app.use('/api/PageSetting', router)
}
