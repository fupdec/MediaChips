import express, {type Express} from 'express'
import type {ApiDb} from '../types/db'
import {validateBody, validateQuery} from '../middleware/validateBody'
import {WebVideoImportSchema, WebVideoPlaybackQuerySchema, WebVideoFrameSchema} from '../../shared/webVideo'
import {importWebVideo, prepareWebVideo, streamWebVideo} from '../services/webVideo/service'
import {saveWebVideoFrame} from '../services/webVideo/frames'

export default function registerWebVideo(app: Express, db: ApiDb) {
  const router = express.Router()
  router.post('/import', validateBody(WebVideoImportSchema), async (req, res) => {
    try {
      res.json(await importWebVideo(db, req.body.url))
    } catch (err) {
      res.status(422).json({message: err instanceof Error ? err.message : 'Web video import failed.'})
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
      res.status(422).json({message: err instanceof Error ? err.message : 'Unable to prepare web video.'})
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
