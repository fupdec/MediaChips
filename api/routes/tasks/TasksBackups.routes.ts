import type { ApiDb } from '../../types/db'
import type { Express } from 'express'
import express from 'express'
import createTasksBackupsController from '../../controllers/tasks/TasksBackups.controller'
import { validateBody } from '../../middleware/validateBody'
import {
  BackupExportRequestSchema,
  BackupNameRequiredRequestSchema,
  PathPayloadSchema,
} from '../../../shared/schemas/requests'

export default function registerRoutes(app: Express, db: ApiDb) {
  const TasksBackups = createTasksBackupsController(app, db)
  const router = express.Router()

  router.get('/createBackup', TasksBackups.createBackup)
  router.get('/getBackups', TasksBackups.getBackups)
  router.post('/deleteBackup', validateBody(BackupNameRequiredRequestSchema), TasksBackups.deleteBackup)
  router.post('/restoreBackup', validateBody(BackupNameRequiredRequestSchema), TasksBackups.restoreBackup)
  router.post('/importBackup', validateBody(PathPayloadSchema), TasksBackups.importBackup)
  router.post('/exportBackup', validateBody(BackupExportRequestSchema), TasksBackups.exportBackup)

  app.use('/api/TasksBackups', router)
}
