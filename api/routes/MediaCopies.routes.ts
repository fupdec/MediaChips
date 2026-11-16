import {Router, type Request, type Response} from 'express'
import {z} from 'zod'
import type {ApiDb} from '../types/db'
import {listMediaCopies, setPreferredCopy, selectPlayableCopy, streamMediaCopy, attachLocalMediaCopy, detachMediaCopy} from '../services/mediaSources/copies'

export function mediaCopiesRouter(db: ApiDb) {
  const router = Router({mergeParams: true})
  const handle = (action: (id: number, req: Request, res: Response, signal: AbortSignal) => unknown) => async (req: Request, res: Response) => {
    const controller = new AbortController()
    const abort = () => controller.abort()
    res.once('close', abort)
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id)
      res.setHeader('Cache-Control', 'no-store')
      await action(id, req, res, controller.signal)
    } catch (err) {
      const error = err as {status?: number; code?: string}
      if (!res.headersSent) res.status(err instanceof z.ZodError ? 400 : error.status || 500).json({code: error.code || 'copy_operation_failed'})
      else res.destroy()
    } finally { res.removeListener('close', abort) }
  }
  router.get('/', handle((id, _req, res) => res.json(listMediaCopies(db, id))))
  router.put('/preferred', handle((id, req, res) => {
    const {copyId} = z.object({copyId: z.string().min(1).nullable()}).parse(req.body)
    res.json(setPreferredCopy(db, id, copyId))
  }))
  router.post('/local', handle(async (id, req, res, signal) => {
    const {path} = z.object({path: z.string().trim().min(1)}).parse(req.body)
    res.json(await attachLocalMediaCopy(db, id, path, signal))
  }))
  router.delete('/:copyId', handle((id, req, res) => res.json(detachMediaCopy(db, id, z.string().min(1).parse(req.params.copyId)))))
  router.get('/playable', handle(async (id, _req, res, signal) => res.json(await selectPlayableCopy(db, id, signal))))
  router.get('/stream', handle((id, req, res, signal) => streamMediaCopy(db, id, req, res, signal)))
  return router
}
