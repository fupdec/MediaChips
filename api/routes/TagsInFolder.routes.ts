import type { Express } from 'express'
import type { ApiDb } from '../types/db'
import express from 'express'
import createTagsInFolderController from '../controllers/TagsInFolder.controller'
import { validateBody, validateQuery } from '../middleware/validateBody'
import {
  TagsInFolderBulkCreateRequestSchema,
  TagsInFolderByPathsRequestSchema,
  TagsInFolderDeleteByMetaRequestSchema,
  TagsInFolderDeleteFromFolderRequestSchema,
  TagsInFolderLinkSchema,
  TagsInFolderPathQuerySchema,
  TagsInFolderPathRequestSchema,
  TagsInFolderRemapPathsRequestSchema,
  TagsInFolderReplaceForMetaRequestSchema,
} from '../../shared/schemas/requests'

export default function registerRoutes(app: Express, db: ApiDb) {
  const TagsInFolder = createTagsInFolderController(db)
  const router = express.Router()

  router.post('/', validateBody(TagsInFolderBulkCreateRequestSchema), TagsInFolder.bulkCreate)
  router.post('/createOne', validateBody(TagsInFolderLinkSchema), TagsInFolder.create)
  router.get('/list', TagsInFolder.listAll)
  router.get('/', validateQuery(TagsInFolderPathQuerySchema), TagsInFolder.findAll)
  router.post('/byPaths', validateBody(TagsInFolderByPathsRequestSchema), TagsInFolder.findByPaths)
  router.post('/clearAll', validateBody(TagsInFolderPathRequestSchema), TagsInFolder.clearAll)
  router.post('/deleteFromFolder', validateBody(TagsInFolderDeleteFromFolderRequestSchema), TagsInFolder.deleteFromFolder)
  router.post('/deleteAllTagsByMetaId', validateBody(TagsInFolderDeleteByMetaRequestSchema), TagsInFolder.deleteAllTagsByMetaId)
  router.post('/replaceForMeta', validateBody(TagsInFolderReplaceForMetaRequestSchema), TagsInFolder.replaceForMeta)
  router.post('/remapPaths', validateBody(TagsInFolderRemapPathsRequestSchema), TagsInFolder.remapPaths)

  app.use('/api/TagsInFolder', router)
}
