import type { TaskControllerShared } from '../../types/tasks'
import { HttpError, sendAsClientError, sendBadRequest, sendControllerError, sendNotFound, sendOk } from '../../types/errors'
import type { ApiRequest, ApiResponse } from '../../types/http'
import { createMarksRepository } from '../../db/repositories/marks'
import { createMediaRepository } from '../../db/repositories/media'
import fs from 'fs'
import { downloadRemoteImage } from '../../services/remoteImageDownload'
import { resolveBundledPublicFile } from '../../utils/publicAssets'
import path from 'path'
import { resolveExistingPath } from '../../services/contentHash'
import { resolveActiveDbFilePath } from '../../services/mediaPathResolver'
import {
  buildVideoGridTaskParams,
  VIDEO_MARK_HEIGHT,
  VIDEO_MARK_JPEG_QUALITY,
} from '../../../shared/videoPreview'
import { upsertVisualHashForMedia } from '../../services/visualHashBackfill'
import { upsertClipEmbeddingForMedia } from '../../services/mediaClipEmbeddings'
import { formatMarkTimestamp } from '../../../shared/markTimestamp'
import { generateVideoGrid } from '../../services/videoGrid'
import { resolveMediaIdFromGridRequest } from '../../services/videoGridRequest'

export default function createTasksVideoPreviewController(shared: TaskControllerShared) {
  const {db, dbPath, createThumbMiddle, createThumbCustom, getImageMedia} = shared
  const marksRepo = createMarksRepository(db.drizzle)
  const mediaRepo = createMediaRepository(db.drizzle)

  const createThumbForVideo = async function (req: ApiRequest, res: ApiResponse) {
    const seekRatio = req.body.seekRatio != null ? Number(req.body.seekRatio) : 0.5
    createThumbMiddle(req.body.path, req.body.id, seekRatio)
      .then((result: string) => {
        sendOk(res, result)
      })
      .catch((e: unknown) => {
        sendAsClientError(res, e, 'Failed to create video thumbnail')
      })
  }

  const createThumb = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const resolvedInputPath = resolveActiveDbFilePath(req.body.inputPath, dbPath)
      if (!resolvedInputPath) {
        sendBadRequest(res, 'The video does not exist.')
        return
      }

      const outputPath = req.body.outputPath
      if (!outputPath) {
        sendBadRequest(res, 'No output path provided.')
        return
      }

      const outputExists = await resolveExistingPath(outputPath)
      if (!req.body.overwrite && outputExists) {
        sendBadRequest(res, 'The image already exists.')
        return
      }

      const outputDir = path.dirname(outputPath)
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, {recursive: true})
      }

      const thumbResult = await createThumbCustom(
        req.body.timestamp,
        resolvedInputPath,
        outputPath,
        req.body.width,
      )
      sendOk(res, thumbResult)
    } catch (e) {
      sendAsClientError(res, e, 'Failed to create thumbnail')
    }
  }

  const createGrid = async function (req: ApiRequest, res: ApiResponse) {
    const gridsPath = path.join(dbPath ?? '', 'media', 'videos', 'grids')

    if (!fs.existsSync(req.body.input)) {
      sendBadRequest(res, 'The video does not exist.')
      return
    }

    const gridPath = path.join(gridsPath, req.body.output);
    const mediaId = resolveMediaIdFromGridRequest(req.body)

    const ensureVisualHash = async (force = false) => {
      if (!mediaId) return
      try {
        if (!force) {
          const existing = mediaRepo.findById(mediaId)
          if (existing?.visualHash) return
        }
        await upsertVisualHashForMedia(db, mediaId)
      } catch {
        // Grid is usable; hash can be filled via Settings → visual hash backfill.
      }
    }

    const ensureClipEmbedding = async () => {
      if (!mediaId) return
      try {
        await upsertClipEmbeddingForMedia(db, mediaId)
      } catch {
        // Grid is usable; CLIP embedding can be filled via Settings backfill.
      }
    }

    if (!fs.existsSync(gridPath)) {
      try {
        const result = await generateVideoGrid(req.body, dbPath ?? '')
        if (result) {
          // Respond as soon as the sprite is on disk. Visual hash / CLIP can take
          // much longer (and block the ffmpeg queue for the next Review item).
          sendOk(res, result)
          void Promise.all([
            ensureVisualHash(true),
            ensureClipEmbedding(),
          ]).catch(() => undefined)
        } else {
          sendBadRequest(res, 'Unable to probe video duration')
        }
      } catch (err) {
        sendAsClientError(res, err, 'Failed to create video grid')
      }
    } else {
      // Small on-scroll batches often recreate/skip existing grids — still fill missing hashes.
      sendBadRequest(res, 'Grid already exists')
      void Promise.all([
        ensureVisualHash(false),
        ensureClipEmbedding(),
      ]).catch(() => undefined)
    }
  }

  const createTimeline = async function (req: ApiRequest, res: ApiResponse) {
    const resolvedVideoPath = await resolveExistingPath(req.body.path)
    if (!resolvedVideoPath) {
      sendBadRequest(res, 'The video does not exist.')
      return
    }

    req.body = {
      ...req.body,
      ...buildVideoGridTaskParams(resolvedVideoPath, `${req.body.id}.jpg`),
    }
    return createGrid(req, res)
  }

  const createImage = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const {outputPath, url, sizes, image} = req.body
      const downloadUrl = url
        || (typeof image === 'string' && /^https?:\/\//i.test(image.trim()) ? image.trim() : null)
      let buf: Buffer

      if (downloadUrl) {
        buf = await downloadRemoteImage(downloadUrl)
      } else if (typeof image === 'string' && path.isAbsolute(image) && fs.existsSync(image)) {
        buf = await fs.promises.readFile(image)
      } else if (typeof image === 'string') {
        const bundled = resolveBundledPublicFile(image)
        if (bundled) {
          buf = await fs.promises.readFile(bundled)
        } else {
          buf = Buffer.from(req.body.image, 'base64')
        }
      } else {
        buf = Buffer.from(req.body.image, 'base64')
      }

      const result = await getImageMedia().processAndSaveImage({
        buffer: buf,
        outputPath,
        sizes,
      })
      sendOk(res, {outputPath: result})
    } catch (e) {
      console.log(e)
      const message = e instanceof Error
        ? e.message
        : 'Failed to download or save image'
      // Soft failure: UI treats 202 as non-fatal image save issues.
      sendControllerError(res, new HttpError(202, message), message)
    }
  }

  const createMarkThumbForMark = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const markId = Number(req.body.markId)
      const mediaId = Number(req.body.mediaId)

      if (!markId || !mediaId) {
        sendBadRequest(res, 'markId and mediaId are required')
        return
      }

      const mark = marksRepo.findByIdAndMediaId(markId, mediaId)

      if (!mark) {
        sendNotFound(res, 'Mark not found')
        return
      }

      const media = mediaRepo.findById(mediaId)

      if (!media?.path) {
        sendNotFound(res, 'Media not found')
        return
      }

      const resolvedInputPath = resolveActiveDbFilePath(media.path, dbPath)
      if (!resolvedInputPath) {
        sendBadRequest(res, 'The video does not exist.')
        return
      }

      const marksDir = path.join(dbPath ?? '', 'media/videos/marks')
      if (!fs.existsSync(marksDir)) {
        fs.mkdirSync(marksDir, {recursive: true})
      }

      const outputPath = path.join(marksDir, `${markId}.jpg`)
      if (!req.body.overwrite && fs.existsSync(outputPath)) {
        sendBadRequest(res, 'The image already exists.')
        return
      }

      await createThumbCustom(
        formatMarkTimestamp(Number(mark.time)),
        resolvedInputPath,
        outputPath,
        VIDEO_MARK_HEIGHT,
        VIDEO_MARK_JPEG_QUALITY,
      )
      sendOk(res, 'success')
    } catch (e) {
      sendAsClientError(res, e, 'Failed to create mark thumbnail')
    }
  }

  return {
    createThumbForVideo,
    createThumb,
    createMarkThumbForMark,
    createGrid,
    createTimeline,
    createImage,
  }
}
