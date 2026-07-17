import type { ApiDb } from '../types/db'
import type { Express } from 'express'
import express from 'express'
import { validateBody } from '../middleware/validateBody'
import { MergeCategoriesRequestSchema } from '../../shared/schemas/requests'
import createMetaController from '../controllers/Meta.controller'

export default function registerRoutes(app: Express, db: ApiDb) {
  const Meta = createMetaController(db);
  const router = express.Router();

  // Create a new Meta
  router.post("/", Meta.create);

  // Retrieve all Meta
  router.get("/", Meta.findAll);

  // Merge tag categories
  router.post("/mergeCategories", validateBody(MergeCategoriesRequestSchema), Meta.mergeCategories);

  // Retrieve a single Meta with id
  router.get("/:id", Meta.findOne);

  // Retrieve the last added meta
  router.post("/latest", Meta.findLatest);

  // Update a Meta with id
  router.put("/:id", Meta.update);

  // Delete a Meta with id
  router.delete("/:id", Meta.deleteOne);

  app.use('/api/Meta', router);
}
