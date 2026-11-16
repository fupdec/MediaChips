import {sourceFailure, sourceRateLimited, sourceRetryAfter} from '../../shared/sourceErrors'
import express, {type Express} from 'express'
import type {ApiDb} from '../types/db'
import {validateBody, validateQuery} from '../middleware/validateBody'
import {WebVideoImportSchema, WebVideoPlaybackQuerySchema, WebVideoFrameSchema} from '../../shared/webVideo'
import {importWebVideo, prepareWebVideo, streamWebVideo} from '../services/webVideo/service'
import {saveWebVideoFrame} from '../services/webVideo/frames'

export default function registerWebVideo(app: Express, db: ApiDb) {
  const router = express.Router()
  const failure = (err: unknown, res: express.Response) => {
    const rateLimited = sourceRateLimited(err) || (err as {code?: string})?.code === 'rate_limited'
    const code = rateLimited ? 'rate_limited' : sourceFailure(err) || 'extraction_failed'
    const delay = rateLimited ? sourceRetryAfter(err) : undefined
    if (delay !== undefined) res.setHeader('Retry-After', delay)
    res.status(rateLimited ? 429 : code === 'network_error' ? 502 : code === 'permission_denied' ? 403 : 422).json({code, message: 'Unable to extract this video page.'})
  }
  router.post('/import', validateBody(WebVideoImportSchema), async (req, res) => {
    try {
      res.json(await importWebVideo(db, req.body.url))
    } catch (err) {
      failure(err, res)
    }
  })
  router.post('/:id/frame', validateBody(WebVideoFrameSchema), async (req, res) => {
    try {
      await saveWebVideoFrame(db, Number(req.params.id), req.body)
      res.json({ok: true})
    } catch {
      res.status(422).json({message: 'Unable to save this video frame.'})
    }
  })
  router.get('/:id/playable', validateQuery(WebVideoPlaybackQuerySchema), async (req, res) => {
    const controller = new AbortController()
    const abort = () => controller.abort()
    res.once('close', abort)
    try {
      const query = WebVideoPlaybackQuerySchema.parse(req.query)
      res.json(await prepareWebVideo(db, Number(req.params.id), {quality: query.quality, fresh: query.fresh === '1', signal: controller.signal}))
    } catch (err) {
      if (res.destroyed) return
      failure(err, res)
    } finally {
      res.off('close', abort)
    }
  })
  router.get('/:id/stream', async (req, res) => {
    try {
      await streamWebVideo(db, req, res, Number(req.params.id))
    } catch {
      if (!res.headersSent && !res.destroyed) res.status(502).json({message: 'Unable to play the remote video stream.'})
      else if (!res.writableEnded) res.destroy()
    }
  })
  app.use('/api/web-video', router)
}
