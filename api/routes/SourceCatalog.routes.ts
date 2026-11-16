import express, {type Express, type Request, type Response} from 'express'
import {z} from 'zod'
import type {ApiDb} from '../types/db'
import {CatalogRootInputSchema, OfflineLimitSchema} from '../../shared/sourceCatalog'
import {createSourceCatalogService} from '../services/mediaSources/catalogService'

export default function registerSourceCatalog(app: Express, db: ApiDb, service = createSourceCatalogService(db)) {
  const router = express.Router()
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
  const handle = (action: (req: Request, res: Response) => unknown) => (req: Request, res: Response) => {
    try { action(req, res) } catch (err) {
      const error = err as {status?: number; code?: string}
      res.status(err instanceof z.ZodError ? 400 : error.status || 500).json({code: error.code || 'invalid_request'})
    }
  }
  const id = (req: Request) => z.string().uuid().parse(req.params.id)
  const mediaId = (req: Request) => z.coerce.number().int().positive().parse(req.params.id)
  router.get('/roots', handle((_req, res) => res.json(service.roots())))
  router.post('/roots', handle((req, res) => res.json(service.saveRoot(CatalogRootInputSchema.parse(req.body)))))
  router.delete('/roots/:id', handle((req, res) => { service.deleteRoot(id(req)); res.json({ok: true}) }))
  router.post('/roots/:id/refresh', handle((req, res) => res.status(202).json(service.refresh(id(req)))))
  router.get('/jobs', handle((_req, res) => res.json(service.jobs())))
  router.get('/jobs/:id', handle((req, res) => res.json(service.job(id(req)))))
  router.post('/jobs/:id/cancel', handle((req, res) => { service.cancel(id(req)); res.json({ok: true}) }))
  router.get('/cache', handle((_req, res) => res.json(service.cache())))
  router.put('/cache', handle((req, res) => { service.setLimit(OfflineLimitSchema.parse(req.body).limitBytes); res.json(service.cache()) }))
  router.get('/media/:id/offline', handle((req, res) => res.json(service.offlineStatus(mediaId(req)))))
  router.post('/media/:id/offline', handle((req, res) => res.status(202).json(service.saveOffline(mediaId(req)))))
  router.delete('/media/:id/offline', handle((req, res) => { service.removeOffline(mediaId(req)); res.json({ok: true}) }))
  router.get('/media/:id/offline/stream', handle((req, res) => service.streamOffline(mediaId(req), res)))
  router.use((_req, res) => res.sendStatus(404))
  app.use('/api/source-catalog', router)
  const timer = setInterval(() => { try { service.tick() } catch { /* Database can be closing or switching. */ } }, 30_000)
  timer.unref()
  app.once('source-catalog:dispose', () => { clearInterval(timer); service.dispose() })
}
