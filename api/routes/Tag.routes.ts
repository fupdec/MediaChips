import type { ApiDb } from '../types/db'
import type { Express } from 'express'
import express from 'express'
import { validateBody } from '../middleware/validateBody'
import { MergeTagsRequestSchema, TagThumbsRequestSchema } from '../../shared/schemas/requests'
import createTagController from '../controllers/Tag.controller'

export default function registerRoutes(app: Express, db: ApiDb) {
  const Tag = createTagController(db);
  const router = express.Router();

  // Create a new Tag
  router.post("/", Tag.create);

  // Retrieve tag count
  router.get("/count", Tag.getCount);

  router.post("/thumbs", validateBody(TagThumbsRequestSchema), Tag.getThumbs);

  // Merge duplicate tags within one category
  router.post("/merge", validateBody(MergeTagsRequestSchema), Tag.merge);

  // Retrieve a single Tag with id
  router.get("/:id", Tag.findOne);

  // Retrieve all Tags
  router.get("/", Tag.getAll);

  // Retrieve all Tags by metaId
  router.post("/items", Tag.getAllForItems);

  // Update a Tag with id
  router.put("/:id", Tag.update);

  // delete an Tag with id
  router.post("/deleteOne", Tag.deleteOne);

  app.use('/api/Tag', router);
}
