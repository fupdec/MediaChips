import express, {type Express} from 'express'
import {z} from 'zod'
import type {ApiDb} from '../types/db'
import {createDuplicatesOnAdd} from '../services/duplicatesOnAdd'

/** Background duplicate check for newly added cards; the UI polls its events and controls the run. */
export default function registerDuplicatesOnAdd(app: Express, db: ApiDb, worker = createDuplicatesOnAdd(db)) {
  const router = express.Router()
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
  router.get('/events', (req, res) => {
    const after = z.coerce.number().int().min(0).catch(0).parse(req.query.after)
    res.json(worker.events(after))
  })
  router.post('/pause', (_req, res) => { res.json(worker.pause()) })
  router.post('/resume', (_req, res) => { res.json(worker.resume()) })
  router.post('/skip', (_req, res) => { res.json(worker.skip()) })
  app.use('/api/duplicates-on-add', router)
  // A pass runs until nothing is pending; while idle a tick is two cheap queries.
  const tick = () => { void worker.tick().catch(() => {}) }
  const initial = setTimeout(tick, 5000)
  const timer = setInterval(tick, 2000)
  initial.unref(); timer.unref()
  app.once('duplicates-on-add:dispose', () => { clearTimeout(initial); clearInterval(timer); worker.dispose() })
}
