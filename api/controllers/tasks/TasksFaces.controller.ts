import type { TaskControllerShared } from '../../types/tasks'
import type { ApiRequest, ApiResponse } from '../../types/http'
import { apiErrorMessage } from '../../types/errors'
import {
  detectMedia,
  getFaceDetectionStatus,
  getStatus,
  iterateFaceDetection,
  loadModel,
} from '../../services/faceDetector'
import { createMediaRepository } from '../../db/repositories/media'
import { resolveExistingPath } from '../../services/contentHash'

export default function createTasksFacesController(shared: TaskControllerShared) {
  const {
    db,
    createStreamAbortSignal,
  } = shared

  const mediaRepo = createMediaRepository(db.drizzle)

  const faceModelStatus = async (_req: ApiRequest, res: ApiResponse) => {
    try {
      res.status(201).send(getStatus(db))
    } catch (err) {
      res.status(500).send({
        message: apiErrorMessage(err) || 'Some error occurred while checking face model status.',
      })
    }
  }

  const downloadFaceModel = async (_req: ApiRequest, res: ApiResponse) => {
    try {
      await loadModel(db)
      res.status(201).send(getStatus(db))
    } catch (err) {
      res.status(500).send({
        message: apiErrorMessage(err) || 'Some error occurred while downloading face model.',
      })
    }
  }

  const faceDetectionStatus = async (_req: ApiRequest, res: ApiResponse) => {
    try {
      res.status(201).send(await getFaceDetectionStatus(db))
    } catch (err) {
      res.status(500).send({
        message: apiErrorMessage(err) || 'Some error occurred while checking face detection status.',
      })
    }
  }

  const detectFacesForMedia = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const mediaId = Number(req.body?.mediaId || req.body?.id)
      if (!Number.isFinite(mediaId) || mediaId <= 0) {
        res.status(400).send({message: 'mediaId is required'})
        return
      }

      const media = mediaRepo.findById(mediaId)
      if (!media) {
        res.status(404).send({message: 'Media not found'})
        return
      }

      const resolvedPath = media.path ? await resolveExistingPath(String(media.path)) : null
      const result = await detectMedia(db, {
        id: media.id,
        path: resolvedPath || media.path,
      }, {
        force: Boolean(req.body?.force),
        framesPerVideo: req.body?.framesPerVideo,
        minScore: req.body?.minScore,
        persist: true,
      })

      res.status(201).send(result)
    } catch (err) {
      res.status(500).send({
        message: apiErrorMessage(err) || 'Some error occurred while detecting faces.',
      })
    }
  }

  const streamFaceDetection = async (req: ApiRequest, res: ApiResponse) => {
    const writeEvent = (event: Record<string, unknown>) => {
      res.write(`${JSON.stringify(event)}\n`)
    }

    try {
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('X-Accel-Buffering', 'no')

      const shouldStop = createStreamAbortSignal(req, res)
      const force = Boolean(req.body?.force) || String(req.query.force || '').toLowerCase() === 'true'
      const mediaIds = Array.isArray(req.body?.mediaIds) ? req.body.mediaIds : undefined
      const paths = Array.isArray(req.body?.paths)
        ? req.body.paths.map((item: unknown) => (
          typeof item === 'string' ? item : (item as {path?: string})?.path
        )).filter(Boolean)
        : undefined

      for await (const event of iterateFaceDetection(db, {
        shouldStop,
        force,
        mediaIds,
        paths,
        framesPerVideo: req.body?.framesPerVideo,
        minScore: req.body?.minScore,
      })) {
        writeEvent(event as unknown as Record<string, unknown>)
      }

      res.end()
    } catch (err) {
      writeEvent({
        type: 'error',
        message: apiErrorMessage(err) || 'Some error occurred while detecting faces.',
      })
      res.end()
    }
  }

  return {
    faceModelStatus,
    downloadFaceModel,
    faceDetectionStatus,
    detectFacesForMedia,
    streamFaceDetection,
  }
}
