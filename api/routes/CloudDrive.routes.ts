import type {ApiDb} from '../types/db'
import type {Express} from 'express'
import express from 'express'
import createCloudDriveController from '../controllers/CloudDrive.controller'

/**
 * Phase 1 Google Drive spike routes (API process).
 * Mount: /api/drive
 */
export default function registerRoutes(app: Express, _db: ApiDb) {
  const controller = createCloudDriveController()
  const router = express.Router()

  router.get('/status', controller.status)
  router.get('/oauth/start', controller.oauthStart)
  router.get('/oauth/callback', controller.oauthCallback)
  router.post('/oauth/logout', controller.logout)
  router.get('/folders/:folderId', controller.listFolder)
  router.get('/files/:fileId/stream', controller.stream)

  app.use('/api/drive', router)
}
