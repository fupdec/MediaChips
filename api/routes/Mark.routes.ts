import type { ApiDb } from '../types/db'
import type { Express } from 'express'

import express from 'express'
import {  validateBody  } from '../middleware/validateBody'
import {  ItemsListRequestSchema, MarkClipsRequestSchema, PathPayloadSchema  } from '../../shared/schemas/requests'
import createMarkController from '../controllers/Mark.controller'



export default function registerRoutes(app: Express, db: ApiDb) {
  const Mark = createMarkController(db);
  const router = express.Router();

  router.post("/", Mark.create);

  router.get("/video/:id", Mark.findAllForVideo);

  router.post("/by-path", validateBody(PathPayloadSchema), Mark.findChaptersByPath);

  router.get("/", Mark.findAll);

  router.post("/items", validateBody(ItemsListRequestSchema), Mark.getItems);

  router.post("/clips", validateBody(MarkClipsRequestSchema), Mark.getClips);

  router.get("/filter-metas", Mark.getFilterMetas);

  router.delete("/:id", Mark.deleteOne);

  app.use('/api/Mark', router);
}
