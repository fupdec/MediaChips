import type { ApiDb } from '../types/db'
import type { Express } from 'express'
import express from 'express'
import createTabController from '../controllers/Tab.controller'
import { validateBody } from '../middleware/validateBody'
import { TabWriteRequestSchema } from '../../shared/schemas/requests'

export default function registerRoutes(app: Express, db: ApiDb) {
  const Tab = createTabController(db)
  const router = express.Router()

  router.post('/', validateBody(TabWriteRequestSchema), Tab.create)
  router.get('/', Tab.findAll)
  router.put('/:id', validateBody(TabWriteRequestSchema), Tab.update)
  router.delete('/:id', Tab.deleteOne)

  app.use('/api/Tab', router)
}
