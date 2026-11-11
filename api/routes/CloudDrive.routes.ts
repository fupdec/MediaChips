import type {ApiDb} from '../types/db'
import type {Express} from 'express'
import express from 'express'
import createCloudDriveController from '../controllers/CloudDrive.controller'

/**
 * Google Drive connection, library and streaming routes (API process).
 * Mount: /api/drive
 */
export default function registerRoutes(app: Express, db: ApiDb) {
  const controller = createCloudDriveController(db)
  const router = express.Router()

  router.get('/status', controller.status)
  router.put('/configuration', controller.configure)
  router.delete('/configuration', controller.removeConfiguration)
  router.post('/import', controller.importFile)
  router.get('/media/:id/playable', controller.playable)
  router.post('/media/:id/frame', controller.frame)
  router.get('/oauth/health', controller.oauthHealth)
  router.get('/oauth/start', controller.oauthStart)
  router.get('/oauth/callback', controller.oauthCallback)
  router.post('/oauth/cancel', controller.oauthCancel)
  router.post('/oauth/logout', controller.logout)
  router.get('/folders/:folderId', controller.listFolder)
  router.get('/files/:fileId/stream', controller.stream)

  app.use('/api/drive', router)
}
