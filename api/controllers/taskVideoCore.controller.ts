import type { ApiDb } from '../types/db'
import { HttpError, apiErrorMessage, sendControllerError, sendCreated, sendOk } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'
import { runNdjsonAsyncGenerator } from './tasks/ndjsonStreamRunner'
import fs from 'fs'
import path from 'path'
import { machineId } from 'node-machine-id'
import { resolveExistingPath } from '../services/contentHash'
import { normalizeMediaPath } from '../utils/normalizeUserPath'
import { getAppConfigPath } from '../utils/appConfigPath'
import {
  getVideoImagesGenerationStatus,
  generateVideoImage,
  iterateVideoImagesGeneration,
} from '../services/videoImagesGeneration'
import type { VideoImageType } from '../types/videoImagesGeneration'
import {
  getImageThumbsGenerationStatus,
  iterateImageThumbsGeneration,
} from '../services/imageThumbsGeneration'
import { loadConfigFile, createDefaultConfig } from '../../app/server/configFile'
import { getImageMetadata, createImageThumb } from '../services/imageMedia'

export default function taskVideoCoreController(db: ApiDb) {
  const getDbPath = () => db.path!

  const checkFileExists = async (req: ApiRequest, res: ApiResponse) => {
    const filePath = normalizeMediaPath(req.body.path)
    const resolved = filePath ? await resolveExistingPath(filePath) : null
    res.status(200).json({ exists: Boolean(resolved) })
  }

  const getConfig = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const configPath = getAppConfigPath()
      const result = loadConfigFile(configPath)
      const configJson = result.config || createDefaultConfig()
      res.status(200).json(configJson)
    } catch (error) {
      sendControllerError(res, error, 'Failed to read config')
    }
  }

  const getMachineId = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const id = await machineId()
      res.status(200).send(id)
    } catch (error) {
      console.error('getMachineId failed:', error)
      sendControllerError(res, error, 'Failed to get machine id')
    }
  }

  const createTimeline = async (req: ApiRequest, res: ApiResponse) => {
    const resolvedVideoPath = await resolveExistingPath(req.body.path)
    if (!resolvedVideoPath) {
      res.status(400).send({message: 'The video does not exist.'})
      return
    }

    const gridPath = path.join(getDbPath(), 'media', 'videos', 'grids', `${req.body.id}.jpg`)
    if (fs.existsSync(gridPath)) {
      res.status(400).send({message: 'Grid already exists'})
      return
    }

    try {
      const result = await generateVideoImage(getDbPath(), 'grid', {
        id: req.body.id,
        path: resolvedVideoPath,
      })

      if (result.status === 'created') {
        sendCreated(res, result)
        return
      }

      if (result.status === 'skipped') {
        sendOk(res, result)
        return
      }

      res.status(400).send({message: result.message || 'Failed to create grid'})
    } catch (error) {
      sendControllerError(
        res,
        error instanceof HttpError ? error : new HttpError(400, apiErrorMessage(error) || String(error)),
        'Failed to create timeline grid',
      )
    }
  }

  const imageThumbsGenerationStatus = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const status = await getImageThumbsGenerationStatus(db, getDbPath())
      sendOk(res, status)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while checking image thumbnails generation status.')
    }
  }

  const streamImageThumbsGeneration = async (req: ApiRequest, res: ApiResponse) => {
    await runNdjsonAsyncGenerator(req, res, {
      errorMessage: 'Some error occurred while generating image thumbnails.',
      iterate: (shouldStop) => iterateImageThumbsGeneration(db, getDbPath(), {
        getImageMetadata,
        createImageThumb: createImageThumb as unknown as (path: string, id: unknown, dbPath: string) => Promise<void>,
      }, {
        shouldStop,
        force: String(req.query.force || '').toLowerCase() === 'true',
      }),
    })
  }

  const videoImagesGenerationStatus = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const status = await getVideoImagesGenerationStatus(db, getDbPath())
      sendOk(res, status)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while checking video images generation status.')
    }
  }

  const streamVideoImagesGeneration = async (req: ApiRequest, res: ApiResponse) => {
    const imageType = String(req.query.type || '').toLowerCase() as VideoImageType
    await runNdjsonAsyncGenerator(req, res, {
      errorMessage: 'Some error occurred while generating video images.',
      iterate: (shouldStop) => iterateVideoImagesGeneration(db, getDbPath(), imageType, {
        shouldStop,
        force: String(req.query.force || '').toLowerCase() === 'true',
      }),
    })
  }

  return {
    checkFileExists,
    getConfig,
    getMachineId,
    createTimeline,
    imageThumbsGenerationStatus,
    streamImageThumbsGeneration,
    videoImagesGenerationStatus,
    streamVideoImagesGeneration,
  }
}
