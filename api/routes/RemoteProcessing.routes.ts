import express, {type Express, type Request, type Response} from 'express'
import {z} from 'zod'
import type {ApiDb} from '../types/db'
import {getRemoteProcessing} from '../services/remoteProcessing'
export default function registerRemoteProcessing(app: Express, db: ApiDb) {
  const router = express.Router(), service = getRemoteProcessing()
  app.once('remote-processing:dispose', () => service.dispose())
  const route = (handler: (req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store')
    try { await handler(req, res) } catch (err) {
      res.status(err instanceof z.ZodError ? 400 : (err as {status?: number})?.status || 500).json({code: (err as {code?: string})?.code || 'processing_failed'})
    }
  }
  const id = (req: Request) => z.string().uuid().parse(req.params.id)
  router.get('/limits', route((_req, res) => { res.json(service.limits) }))
  router.get('/jobs', route((_req, res) => { res.json(service.list(db)) }))
  router.post('/jobs', route((req, res) => { res.status(202).json(service.submit(db, req.body)) }))
  router.get('/jobs/:id', route((req, res) => { res.json(service.job(db, id(req))) }))
  router.post('/jobs/:id/cancel', route((req, res) => { service.cancel(db, id(req)); res.json({ok: true}) }))
  router.delete('/jobs/:id', route((req, res) => { service.remove(db, id(req)); res.json({ok: true}) }))
  router.get('/jobs/:id/result', route((req, res) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.sendFile(service.result(db, id(req))) }))
  app.use('/api/remote-processing', router)
}
