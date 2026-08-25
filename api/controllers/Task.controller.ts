import type { ApiDb } from '../types/db'
import type { ApiRequest, ApiResponse } from '../types/http'
import createTaskControllerShared from './tasks/taskControllerShared'
import createTasksFileController from './tasks/TasksFile.controller'
import createTasksMediaController from './tasks/TasksMedia.controller'
import createTasksVideoPreviewController from './tasks/TasksVideoPreview.controller'
import createTasksDatabaseController from './tasks/TasksDatabase.controller'
import createTasksTaggingController from './tasks/TasksTagging.controller'
import createTasksFacesController from './tasks/TasksFaces.controller'
import createTasksMaintenanceController from './tasks/TasksMaintenance.controller'
import createTasksLocalAiController from './tasks/TasksLocalAi.controller'
import { startVideoConversion, getVideoConversionJob, cancelVideoConversion, cancelAllVideoConversions } from '../services/videoConversionService'
import { sendBadRequest, sendNotFound, sendOk } from '../types/errors'
import { createMediaRepository } from '../db/repositories/media'
import type { ConvertVideosPayload, TestVideoSegmentPayload } from '@shared/api/payloads'
import fs from 'fs'
import path from 'path'
import { cutVideoSegment, ffprobe, resolveFfprobeDuration } from '../utils/ffmpeg'

export default function createTaskController(db: ApiDb) {
  const shared = createTaskControllerShared(db)

  const convertVideos = (req: ApiRequest, res: ApiResponse) => {
    try {
      const body = req.body as unknown as ConvertVideosPayload
      const mediaRepo = createMediaRepository(db.drizzle)
      for (const item of body.items) {
        const media = mediaRepo.findById(item.id)
        if (!media) return sendBadRequest(res, `Media ${item.id} not found`)
        if (String(media.path) !== item.path) return sendBadRequest(res, `Media path mismatch for ${item.id}`)
      }
      return sendOk(res, {data: startVideoConversion(db, body.items, body.options)})
    } catch (error) { return sendBadRequest(res, error instanceof Error ? error.message : String(error)) }
  }
  const createTestVideoSegment = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const body = req.body as unknown as TestVideoSegmentPayload
      const mediaRepo = createMediaRepository(db.drizzle)
      const media = mediaRepo.findById(body.id)
      if (!media) return sendBadRequest(res, `Media ${body.id} not found`)
      if (String(media.path) !== body.path) return sendBadRequest(res, `Media path mismatch for ${body.id}`)
      if (!fs.existsSync(body.path)) return sendBadRequest(res, 'Source file not found')
      fs.mkdirSync(body.destination, {recursive: true})
      const parsed = path.parse(body.path)
      let output = path.join(body.destination, `${parsed.name}_TEST_5S.mp4`)
      let index = 1
      while (fs.existsSync(output)) output = path.join(body.destination, `${parsed.name}_TEST_5S_${++index}.mp4`)
      const probe = await ffprobe(body.path)
      const duration = await resolveFfprobeDuration(body.path, probe.format?.duration)
      if (!duration || duration <= 0) return sendBadRequest(res, 'Source has no usable duration')
      const durationSeconds = Math.min(5, duration)
      const startSeconds = Math.max(0, (duration - durationSeconds) / 2)
      await cutVideoSegment({input: body.path, outputPath: output, startSeconds, durationSeconds})
      return sendOk(res, {data: {outputPath: output, durationSeconds}})
    } catch (error) { return sendBadRequest(res, error instanceof Error ? error.message : String(error)) }
  }

  const conversionStatus = (req: ApiRequest, res: ApiResponse) => {
    const job = getVideoConversionJob(String(req.params.jobId))
    return job ? sendOk(res, {data: job}) : sendNotFound(res, 'Conversion job not found')
  }
  const cancelConversion = (req: ApiRequest, res: ApiResponse) => sendOk(res, {data: {cancelled: cancelVideoConversion(String(req.params.jobId))}})
  const cancelAllConversions = (_req: ApiRequest, res: ApiResponse) => sendOk(res, {data: {cancelled: cancelAllVideoConversions()}})

  const importSavedFilters = (_req: ApiRequest, _res: ApiResponse) => {
    // res.status(201).send(_saved_filters.savedFilters)
  }

  return {
    importSavedFilters,
    convertVideos,
    createTestVideoSegment,
    conversionStatus,
    cancelConversion,
    cancelAllConversions,
    ...createTasksFileController(shared),
    ...createTasksMediaController(shared),
    ...createTasksVideoPreviewController(shared),
    ...createTasksDatabaseController(shared),
    ...createTasksTaggingController(shared),
    ...createTasksFacesController(shared),
    ...createTasksMaintenanceController(shared),
    ...createTasksLocalAiController(shared),
  }
}
