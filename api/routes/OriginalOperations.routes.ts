import express, {type Express, type Request, type Response} from 'express'
import {z} from 'zod'
import type {ApiDb} from '../types/db'
import {createOriginalOperationsService} from '../services/originals/service'
import {resolveMediaLocation} from '../services/mediaSources/locations'
import {getCloudDriveService} from '../services/cloudDrive'
import path from 'path'
import {OriginalBatchSchema} from '../../shared/originalOperations'

export default function registerOriginalOperations(app: Express, db: ApiDb, service = createOriginalOperationsService(db)) {
  const router = express.Router()
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
  const handle = (action: (req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
    try { await action(req, res) } catch (err) {
      if (res.headersSent || res.destroyed) return
      const error = err as {status?: number; code?: string}
      res.status(err instanceof z.ZodError ? 400 : error.status || 500).json({code: err instanceof z.ZodError ? 'invalid_request' : error.code || 'operation_failed'})
    }
  }
  const id = (value: unknown) => z.string().uuid().parse(value)
  router.get('/media/:id', handle(async (req, res) => {
    const resolved = resolveMediaLocation(db, z.coerce.number().int().positive().parse(req.params.id))
    let parentKey: string | undefined
    let name = resolved.provider === 'local' ? path.basename(resolved.card.path) : resolved.provider === 'nas' ? path.posix.basename(resolved.location.resourceKey) : resolved.card.basename || resolved.card.name || ''
    let writable = resolved.provider === 'nas' || (resolved.provider === 'local' && !resolved.card.path.includes('://') && !resolved.card.path.includes('!/'))
    if (resolved.provider === 'gdrive') {
      const drive = getCloudDriveService()
      writable = drive.status().capabilities.move
      try { const file = await drive.transport.getFileMeta(resolved.location.resourceKey); parentKey = file.parents?.[0] || 'root'; name = file.name } catch { writable = false }
    }
    res.json({provider: resolved.provider, path: resolved.card.path, name, ext: resolved.card.ext, parentKey,
      source: resolved.provider === 'local' ? {key: resolved.card.path} : {connectionId: resolved.location.connectionId, key: resolved.location.resourceKey},
      writable})
  }))
  router.get('/jobs', handle((_req, res) => res.json(service.jobs())))
  router.get('/jobs/:id', handle((req, res) => res.json(service.job(id(req.params.id)))))
  router.post('/jobs', express.json(), handle(async (req, res) => {
    const input = OriginalBatchSchema.parse(req.body)
    if (input.items.some(item => item.target?.connectionId === 'google-drive' && item.target.key === 'root')) {
      // Pin the current account's root ID before queueing. A later account
      // switch cannot redirect an already authorized upload to another My Drive.
      const root = await getCloudDriveService().transport.getFileMeta('root')
      for (const item of input.items) if (item.target?.connectionId === 'google-drive' && item.target.key === 'root') item.target.key = root.id
    }
    res.status(202).json(service.create(input))
  }))
  router.post('/jobs/:id/retry', handle((req, res) => res.status(202).json(service.retry(id(req.params.id), z.enum(['fail', 'skip', 'keep-both']).optional().parse(req.body?.conflict)))))
  router.post('/jobs/:id/cancel', handle((req, res) => { service.cancel(id(req.params.id)); res.json({ok: true}) }))
  // Raw request streams go straight to disk; never buffer originals in express.json/raw.
  router.put('/jobs/:id/uploads/:itemId', handle(async (req, res) => res.status(202).json(await service.upload(id(req.params.id), id(req.params.itemId), req))))
  app.use('/api/original-operations', router)
  const timer = setInterval(() => { void service.tick().catch(() => {}) }, 1000)
  timer.unref()
  app.once('original-operations:dispose', () => { clearInterval(timer); service.dispose() })
}
