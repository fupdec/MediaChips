import express, {type Express, type Request, type Response} from 'express'
import {z} from 'zod'
import type {ApiDb} from '../types/db'
import {validateBody} from '../middleware/validateBody'
import {NasConnectionSchema, NasImportSchema, NasBatchImportSchema, NasPathSchema, NasListSchema} from '../../shared/nas'
import {WebVideoFrameSchema} from '../../shared/webVideo'
import {isNasMediaPath} from '../../shared/remoteMedia'
import {createNasService, type NasService} from '../services/nas/service'
import {NasError} from '../services/nas/errors'
import {saveWebVideoFrame} from '../services/webVideo/frames'

export default function registerNas(app: Express, db: ApiDb, service: NasService = createNasService()) {
  const router = express.Router()
  const handle = (action: (req: Request, res: Response) => Promise<unknown> | unknown) => async (req: Request, res: Response) => {
    try { await action(req, res) } catch (err) {
      if (res.destroyed) return
      if (res.headersSent) { if (!res.writableEnded) res.destroy(); return }
      if (err instanceof z.ZodError) { res.status(400).json({code: 'invalid_request', message: 'Invalid NAS request.'}); return }
      const error = err instanceof NasError ? err : new NasError('connection_failed', 'NAS request failed. Check connection, permissions and credentials.', 502)
      res.status(error.status).json({code: error.code, message: error.message, fingerprint: error.fingerprint})
    }
  }
  const connectionId = (req: Request) => z.string().uuid().parse(req.params.id)
  const mediaId = (req: Request) => z.coerce.number().int().positive().parse(req.params.id)
  router.get('/image', handle((req, res) => service.streamImage(db, req, res, z.string().max(8192).parse(req.query.path))))
  router.get('/connections', handle((_req, res) => res.json(service.connections(db))))
  router.post('/connections', validateBody(NasConnectionSchema), handle(async (req, res) => res.json(await service.saveConnection(db, req.body))))
  router.put('/connections/:id', validateBody(NasConnectionSchema), handle(async (req, res) => res.json(await service.saveConnection(db, req.body, connectionId(req)))))
  router.post('/connections/:id/disconnect', handle((req, res) => { service.disconnect(db, connectionId(req)); res.json({ok: true}) }))
  router.get('/connections/:id/files', handle(async (req, res) => {
    const query = NasListSchema.parse(req.query)
    const result = await service.list(db, connectionId(req), query.path, query.pageToken)
    res.json({...result, entries: result.entries.slice(0, 5000)})
  }))
  router.get('/connections/:id/playable', handle(async (req, res) => {
    const query = NasPathSchema.parse(req.query)
    const controller = new AbortController()
    const abort = () => controller.abort()
    res.once('close', abort)
    try { res.json(await service.preparePreview(db, connectionId(req), query.path, controller.signal)) }
    finally { res.removeListener('close', abort) }
  }))
  router.get('/connections/:id/stream', handle((req, res) => service.stream(db, req, res, null, connectionId(req))))
  router.post('/import', validateBody(NasImportSchema), handle(async (req, res) => res.json(await service.importFile(db, req.body.connectionId, req.body.path))))
  router.post('/import-batch', validateBody(NasBatchImportSchema), handle(async (req, res) => {
    const controller = new AbortController()
    const abort = () => controller.abort()
    res.once('close', abort)
    try { res.json(await service.importFiles(db, req.body.connectionId, req.body.paths, controller.signal)) }
    finally { res.removeListener('close', abort) }
  }))
  router.get('/media/:id/playable', handle(async (req, res) => {
    const controller = new AbortController()
    const abort = () => controller.abort()
    res.once('close', abort)
    try { res.json(await service.prepare(db, mediaId(req), controller.signal)) }
    finally { res.removeListener('close', abort) }
  }))
  router.get('/media/:id/stream', handle((req, res) => service.stream(db, req, res, mediaId(req))))
  router.post('/media/:id/frame', validateBody(WebVideoFrameSchema), handle(async (req, res) => {
    await saveWebVideoFrame(db, mediaId(req), req.body, isNasMediaPath)
    res.json({ok: true})
  }))
  app.use('/api/nas', router)
}
