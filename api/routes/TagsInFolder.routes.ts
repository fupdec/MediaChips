import type { Express } from 'express'
import type { ApiDb } from '../types/db'
import express from 'express'
import createTagsInFolderController from '../controllers/TagsInFolder.controller'

export default function registerRoutes(app: Express, db: ApiDb) {
  const TagsInFolder = createTagsInFolderController(db)
  const router = express.Router()

  router.post('/', TagsInFolder.bulkCreate)
  router.post('/createOne', TagsInFolder.create)
  router.get('/list', TagsInFolder.listAll)
  router.get('/', TagsInFolder.findAll)
  router.post('/byPaths', TagsInFolder.findByPaths)
  router.post('/clearAll', TagsInFolder.clearAll)
  router.post('/deleteFromFolder', TagsInFolder.deleteFromFolder)
  router.post('/deleteAllTagsByMetaId', TagsInFolder.deleteAllTagsByMetaId)
  router.post('/replaceForMeta', TagsInFolder.replaceForMeta)
  router.post('/remapPaths', TagsInFolder.remapPaths)

  app.use('/api/TagsInFolder', router)
}
