import express, {type Express, type Request, type Response} from 'express'
import {z} from 'zod'
import type {ApiDb} from '../types/db'
import {CopyDiscoveryInputSchema} from '../../shared/copyDiscovery'
import {createCopyDiscoveryService} from '../services/mediaSources/copyDiscovery'
import {createCopyDiscoveryAutomation} from '../services/mediaSources/copyDiscoveryAutomation'
import {registerBackgroundTaskProvider} from '../services/backgroundTasks'

export default function registerCopyDiscovery(app: Express, db: ApiDb, service = createCopyDiscoveryService(db)) {
  const router = express.Router()
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
  const handle = (action: (req: Request, res: Response) => unknown) => (req: Request, res: Response) => {
    try { action(req, res) } catch (err) {
      const error = err as {status?: number; code?: string}
      res.status(err instanceof z.ZodError ? 400 : error.status || 500).json({code: error.code || 'copy_operation_failed'})
    }
  }
  const id = (value: unknown) => z.string().uuid().parse(value)
  router.get('/jobs', handle((_req, res) => res.json(service.jobs())))
  router.delete('/jobs/history', handle((_req, res) => res.json(service.clearHistory())))
  router.post('/jobs', express.json(), handle((req, res) => res.status(202).json(service.create(CopyDiscoveryInputSchema.parse(req.body)))))
  router.get('/activity', handle((_req, res) => res.json(service.activity())))
  router.post('/jobs/:id/pause', handle((req, res) => res.json(service.pause(id(req.params.id)))))
  router.post('/jobs/:id/resume', handle((req, res) => res.json(service.resume(id(req.params.id)))))
  router.get('/jobs/:id', handle((req, res) => res.json(service.job(id(req.params.id)))))
  router.post('/jobs/:id/cancel', handle((req, res) => res.json(service.cancel(id(req.params.id)))))
  router.post('/jobs/:id/retry', handle((req, res) => res.status(202).json(service.retry(id(req.params.id)))))
  router.post('/jobs/:id/items/:itemId/choose', express.json(), handle((req, res) => res.status(202).json(service.choose(id(req.params.id), id(req.params.itemId), z.object({mediaId: z.number().int().positive()}).strict().parse(req.body).mediaId))))
  router.post('/jobs/:id/items/:itemId/undo', handle((req, res) => res.json(service.undo(id(req.params.id), id(req.params.itemId)))))
  app.use('/api/copy-discovery', router)
  const automation = createCopyDiscoveryAutomation(db, service)
  const timer = setInterval(() => {
    void automation.tick().catch(() => {})
    void service.tick().catch(() => {})
  }, 1000)
  timer.unref()
  const unregisterTasks = registerBackgroundTaskProvider(() => service.backgroundTasks())
  app.once('copy-discovery:dispose', () => { clearInterval(timer); unregisterTasks(); automation.dispose(); service.dispose() })
}
