import type { TaskControllerShared } from '../../types/tasks'
import type { AnyRecord } from '../../types/db'
import { apiErrorMessage } from '../../types/errors'
import type { ApiRequest, ApiResponse } from '../../types/http'
import { createMediaRepository } from '../../db/repositories/media'
import path from 'path'
import {
  getContentHashBackfillStatus,
  iterateContentHashBackfill,
} from '../../services/contentHashBackfill'
import {
  getVideoCodecBackfillStatus,
  iterateVideoCodecBackfill,
} from '../../services/videoCodecBackfill'
import {
  getMissingMediaStatus,
  iterateMissingMediaSearch,
} from '../../services/missingMediaFinder'
import {
  getImageThumbsGenerationStatus,
  iterateImageThumbsGeneration,
} from '../../services/imageThumbsGeneration'

export default function createTasksMaintenanceController(shared: TaskControllerShared) {
  const {
    db,
    getDbPath,
    createStreamAbortSignal,
    getVideoImagesGeneration,
    getImageMedia,
  } = shared

  const mediaRepo = createMediaRepository(db.drizzle)

  const contentHashBackfillStatus = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const status = await getContentHashBackfillStatus(db)
      res.status(201).send(status)
    } catch (err) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while checking content hash status."
      })
    }
  }

  const videoCodecBackfillStatus = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const status = await getVideoCodecBackfillStatus(db)
      res.status(201).send(status)
    } catch (err) {
      res.status(500).send({
        message: apiErrorMessage(err) || 'Some error occurred while checking video codec status.',
      })
    }
  }

  const streamVideoCodecBackfill = async (req: ApiRequest, res: ApiResponse) => {
    const writeEvent = (event: Record<string, unknown>) => {
      res.write(`${JSON.stringify(event)}\n`)
    }

    try {
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('X-Accel-Buffering', 'no')

      const shouldStop = createStreamAbortSignal(req, res)

      for await (const event of iterateVideoCodecBackfill(db, {
        shouldStop,
        force: String(req.query.force || '').toLowerCase() === 'true',
      })) {
        writeEvent(event)
      }

      res.end()
    } catch (err) {
      writeEvent({
        type: 'error',
        message: apiErrorMessage(err) || 'Some error occurred while backfilling video codecs.',
      })
      res.end()
    }
  }

  const imageThumbsGenerationStatus = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const status = await getImageThumbsGenerationStatus(db, getDbPath() ?? '')
      res.status(201).send(status)
    } catch (err) {
      res.status(500).send({
        message: apiErrorMessage(err) || 'Some error occurred while checking image thumbnails generation status.',
      })
    }
  }

  const streamImageThumbsGeneration = async (req: ApiRequest, res: ApiResponse) => {
    const writeEvent = (event: Record<string, unknown>) => {
      res.write(`${JSON.stringify(event)}\n`)
    }

    try {
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('X-Accel-Buffering', 'no')

      const shouldStop = createStreamAbortSignal(req, res)

      for await (const event of iterateImageThumbsGeneration(db, getDbPath() ?? '', getImageMedia() as unknown as {
        getImageMetadata: (path: string) => Promise<unknown>
        createImageThumb: (path: string, id: unknown, dbPath: string) => Promise<void>
      }, {
        shouldStop,
        force: String(req.query.force || '').toLowerCase() === 'true',
      })) {
        writeEvent(event)
      }

      res.end()
    } catch (err) {
      writeEvent({
        type: 'error',
        message: apiErrorMessage(err) || 'Some error occurred while generating image thumbnails.',
      })
      res.end()
    }
  }

  const videoImagesGenerationStatus = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const status = await getVideoImagesGeneration().getVideoImagesGenerationStatus(db, getDbPath())
      res.status(201).send(status)
    } catch (err) {
      res.status(500).send({
        message: apiErrorMessage(err) || 'Some error occurred while checking video images generation status.',
      })
    }
  }

  const streamVideoImagesGeneration = async (req: ApiRequest, res: ApiResponse) => {
    const imageType = String(req.query.type || '').toLowerCase()
    const writeEvent = (event: Record<string, unknown>) => {
      res.write(`${JSON.stringify(event)}\n`)
    }

    try {
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('X-Accel-Buffering', 'no')

      const shouldStop = createStreamAbortSignal(req, res)

      for await (const event of getVideoImagesGeneration().iterateVideoImagesGeneration(db, getDbPath(), imageType, {
        shouldStop,
        force: String(req.query.force || '').toLowerCase() === 'true',
      })) {
        writeEvent(event)
      }

      res.end()
    } catch (err) {
      writeEvent({
        type: 'error',
        message: apiErrorMessage(err) || 'Some error occurred while generating video images.',
      })
      res.end()
    }
  }

  const streamContentHashBackfill = async (req: ApiRequest, res: ApiResponse) => {
    const writeEvent = (event: Record<string, unknown>) => {
      res.write(`${JSON.stringify(event)}\n`)
    }

    try {
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('X-Accel-Buffering', 'no')

      const shouldStop = createStreamAbortSignal(req, res)

      for await (const event of iterateContentHashBackfill(db, {
        shouldStop,
        force: String(req.query.force || '').toLowerCase() === 'true',
      })) {
        writeEvent(event)
      }

      res.end()
    } catch (err) {
      writeEvent({
        type: 'error',
        message: apiErrorMessage(err) || "Some error occurred while backfilling content hashes."
      })
      res.end()
    }
  }

  const missingMediaStatus = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const status = await getMissingMediaStatus(db)
      res.status(201).send(status)
    } catch (err) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while checking missing media status."
      })
    }
  }

  const streamFindMissingMedia = async (req: ApiRequest, res: ApiResponse) => {
    const writeEvent = (event: Record<string, unknown>) => {
      res.write(`${JSON.stringify(event)}\n`)
    }

    try {
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('X-Accel-Buffering', 'no')

      const folders = Array.isArray(req.body?.folders) ? req.body.folders : []
      const shouldStop = createStreamAbortSignal(req, res)

      for await (const event of iterateMissingMediaSearch(db, {
        folders,
        shouldStop,
      })) {
        writeEvent(event)
      }

      res.end()
    } catch (err) {
      writeEvent({
        type: 'error',
        message: apiErrorMessage(err) || "Some error occurred while searching for missing media."
      })
      res.end()
    }
  }

  const relinkMissingMedia = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const matches = Array.isArray(req.body?.matches) ? req.body.matches : []
      let updated = 0

      for (const item of matches) {
        const filePath = item.newPath || item.path
        const mediaId = item.id

        if (!filePath || !mediaId) continue

        const data: AnyRecord = {
          path: filePath,
          basename: path.basename(filePath),
          name: path.parse(filePath).name,
          ext: path.extname(filePath),
        }

        if (item.contentHash) {
          data.contentHash = item.contentHash
        }

        mediaRepo.updateById(Number(mediaId), data, {silent: true})

        updated += 1
      }

      res.status(201).send({updated})
    } catch (err) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while relinking missing media."
      })
    }
  }

  return {
    contentHashBackfillStatus,
    streamContentHashBackfill,
    videoCodecBackfillStatus,
    streamVideoCodecBackfill,
    imageThumbsGenerationStatus,
    streamImageThumbsGeneration,
    videoImagesGenerationStatus,
    streamVideoImagesGeneration,
    missingMediaStatus,
    streamFindMissingMedia,
    relinkMissingMedia,
  }
}
