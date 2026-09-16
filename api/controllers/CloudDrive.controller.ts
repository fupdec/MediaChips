import type {Request, Response} from 'express'
import {getCloudDriveService} from '../services/cloudDrive'

function createCloudDriveController() {
  return {
    async status(_req: Request, res: Response) {
      const service = getCloudDriveService()
      res.json({
        ...service.status(),
        approach: 'server-side-range-proxy',
        note: 'Phase 1 spike: OAuth + list one folder + Range proxy. No library import, mpv, or thumbs.',
      })
    },

    async oauthStart(req: Request, res: Response) {
      try {
        const service = getCloudDriveService()
        const state = typeof req.query.state === 'string' ? req.query.state : undefined
        const url = service.getAuthUrl(state)
        res.json({url, redirectUri: service.config.redirectUri, scopes: service.config.scopes})
      } catch (err: unknown) {
        res.status(400).json({message: err instanceof Error ? err.message : String(err)})
      }
    },

    async oauthCallback(req: Request, res: Response) {
      const service = getCloudDriveService()
      const error = typeof req.query.error === 'string' ? req.query.error : null
      if (error) {
        return res.status(400).send(`Google OAuth error: ${error}`)
      }
      const code = typeof req.query.code === 'string' ? req.query.code : ''
      if (!code) {
        return res.status(400).send('Missing OAuth code')
      }
      try {
        await service.handleOAuthCallback(code)
        res.status(200).send(
          'Google Drive connected. You can close this window and call GET /api/drive/folders/root (or a folder id).',
        )
      } catch (err: unknown) {
        console.error('Drive OAuth callback failed:', err)
        res.status(500).send(err instanceof Error ? err.message : 'OAuth exchange failed')
      }
    },

    async logout(_req: Request, res: Response) {
      getCloudDriveService().logout()
      res.json({ok: true})
    },

    async listFolder(req: Request, res: Response) {
      try {
        const service = getCloudDriveService()
        const folderId = String(req.params.folderId || 'root')
        const pageToken = typeof req.query.pageToken === 'string' ? req.query.pageToken : undefined
        const result = await service.listFolder(folderId, pageToken)
        res.json(result)
      } catch (err: unknown) {
        const status = (err as {status?: number})?.status || 500
        res.status(status).json({message: err instanceof Error ? err.message : String(err)})
      }
    },

    async stream(req: Request, res: Response) {
      try {
        const service = getCloudDriveService()
        if (!service.config.mock && !service.store.get()?.accessToken) {
          return res.status(401).json({message: 'Not authenticated with Google Drive'})
        }
        const fileId = String(req.params.fileId || '')
        if (!fileId) {
          return res.status(400).json({message: 'Missing file id'})
        }
        await service.streamFile(req, res, service.transport, fileId)
      } catch (err: unknown) {
        console.error('Drive stream route error:', err)
        if (!res.headersSent) {
          res.status(500).json({message: err instanceof Error ? err.message : String(err)})
        }
      }
    },
  }
}

export default createCloudDriveController
