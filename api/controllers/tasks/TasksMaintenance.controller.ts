import type { TaskControllerShared } from '../../types/tasks'
import type { AnyRecord } from '../../types/db'
import { sendControllerError, sendOk } from '../../types/errors'
import type { ApiRequest, ApiResponse } from '../../types/http'
import { runNdjsonAsyncGenerator } from './ndjsonStreamRunner'
import { createMediaRepository } from '../../db/repositories/media'
import { parseMediaFilePath } from '../../../shared/mediaPath'
import {
  getContentHashBackfillStatus,
  getFingerprintBackfillStatus,
  getOshashBackfillStatus,
  iterateContentHashBackfill,
  iterateFingerprintBackfill,
  iterateOshashBackfill,
} from '../../services/mediaFingerprintBackfill'
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
import { iterateScanFolderDuplicates } from '../../services/scanFolderDuplicates'
import {
  getTagImageAiUpscaleStatus,
  iterateTagImageAiUpscale,
} from '../../services/tagImageAiUpscale'
import {
  getVisualHashBackfillStatus,
  iterateVisualHashBackfill,
} from '../../services/visualHashBackfill'

export default function createTasksMaintenanceController(shared: TaskControllerShared) {
  const {
    db,
    getDbPath,
    getVideoImagesGeneration,
    getImageMedia,
  } = shared

  const mediaRepo = createMediaRepository(db.drizzle)

  const contentHashBackfillStatus = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const status = await getContentHashBackfillStatus(db)
      sendOk(res, status)
    } catch (err) {
      sendControllerError(res, err, "Some error occurred while checking content hash status.")
    }
  }

  const oshashBackfillStatus = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const status = await getOshashBackfillStatus(db)
      sendOk(res, status)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while checking oshash status.')
    }
  }

  const fingerprintBackfillStatus = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const status = await getFingerprintBackfillStatus(db)
      sendOk(res, status)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while checking fingerprint status.')
    }
  }

  const videoCodecBackfillStatus = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const status = await getVideoCodecBackfillStatus(db)
      sendOk(res, status)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while checking video codec status.')
    }
  }

  const streamVideoCodecBackfill = async (req: ApiRequest, res: ApiResponse) => {
    await runNdjsonAsyncGenerator(req, res, {
      errorMessage: 'Some error occurred while backfilling video codecs.',
      iterate: (shouldStop) => iterateVideoCodecBackfill(db, {
        shouldStop,
        force: String(req.query.force || '').toLowerCase() === 'true',
      }),
    })
  }

  const imageThumbsGenerationStatus = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const status = await getImageThumbsGenerationStatus(db, getDbPath() ?? '')
      sendOk(res, status)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while checking image thumbnails generation status.')
    }
  }

  const streamImageThumbsGeneration = async (req: ApiRequest, res: ApiResponse) => {
    await runNdjsonAsyncGenerator(req, res, {
      errorMessage: 'Some error occurred while generating image thumbnails.',
      iterate: (shouldStop) => iterateImageThumbsGeneration(db, getDbPath() ?? '', getImageMedia() as unknown as {
        getImageMetadata: (path: string) => Promise<unknown>
        createImageThumb: (path: string, id: unknown, dbPath: string) => Promise<void>
      }, {
        shouldStop,
        force: String(req.query.force || '').toLowerCase() === 'true',
      }),
    })
  }

  const videoImagesGenerationStatus = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const status = await getVideoImagesGeneration().getVideoImagesGenerationStatus(db, getDbPath())
      sendOk(res, status)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while checking video images generation status.')
    }
  }

  const streamVideoImagesGeneration = async (req: ApiRequest, res: ApiResponse) => {
    const imageType = String(req.query.type || '').toLowerCase()
    await runNdjsonAsyncGenerator(req, res, {
      errorMessage: 'Some error occurred while generating video images.',
      iterate: (shouldStop) => getVideoImagesGeneration().iterateVideoImagesGeneration(db, getDbPath(), imageType, {
        shouldStop,
        force: String(req.query.force || '').toLowerCase() === 'true',
      }),
    })
  }

  const streamContentHashBackfill = async (req: ApiRequest, res: ApiResponse) => {
    await runNdjsonAsyncGenerator(req, res, {
      errorMessage: 'Some error occurred while backfilling content hashes.',
      iterate: (shouldStop) => iterateContentHashBackfill(db, {
        shouldStop,
        force: String(req.query.force || '').toLowerCase() === 'true',
      }),
    })
  }

  const streamOshashBackfill = async (req: ApiRequest, res: ApiResponse) => {
    await runNdjsonAsyncGenerator(req, res, {
      errorMessage: 'Some error occurred while backfilling oshash values.',
      iterate: (shouldStop) => iterateOshashBackfill(db, {
        shouldStop,
        force: String(req.query.force || '').toLowerCase() === 'true',
      }),
    })
  }

  const streamFingerprintBackfill = async (req: ApiRequest, res: ApiResponse) => {
    await runNdjsonAsyncGenerator(req, res, {
      errorMessage: 'Some error occurred while backfilling fingerprints.',
      iterate: (shouldStop) => iterateFingerprintBackfill(db, {
        shouldStop,
        force: String(req.query.force || '').toLowerCase() === 'true',
      }),
    })
  }

  const visualHashBackfillStatus = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const status = await getVisualHashBackfillStatus(db)
      sendOk(res, status)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while checking visual hash status.')
    }
  }

  const streamVisualHashBackfill = async (req: ApiRequest, res: ApiResponse) => {
    await runNdjsonAsyncGenerator(req, res, {
      errorMessage: 'Some error occurred while backfilling visual hashes.',
      iterate: (shouldStop) => iterateVisualHashBackfill(db, {
        shouldStop,
        force: String(req.query.force || '').toLowerCase() === 'true',
      }),
    })
  }

  const missingMediaStatus = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const full = String(req.query?.full || '').toLowerCase() === 'true'
      const status = await getMissingMediaStatus(db, {full})
      sendOk(res, status)
    } catch (err) {
      sendControllerError(res, err, "Some error occurred while checking missing media status.")
    }
  }

  const streamFindMissingMedia = async (req: ApiRequest, res: ApiResponse) => {
    const folders = Array.isArray(req.body?.folders) ? req.body.folders : []
    await runNdjsonAsyncGenerator(req, res, {
      errorMessage: 'Some error occurred while searching for missing media.',
      iterate: (shouldStop) => iterateMissingMediaSearch(db, {
        folders,
        shouldStop,
      }),
    })
  }

  const streamScanFolderDuplicates = async (req: ApiRequest, res: ApiResponse) => {
    const folders = Array.isArray(req.body?.folders) ? req.body.folders : []
    const paths = Array.isArray(req.body?.paths) ? req.body.paths : []
    const excluded = Array.isArray(req.body?.excluded) ? req.body.excluded : []
    await runNdjsonAsyncGenerator(req, res, {
      errorMessage: 'Some error occurred while scanning folder duplicates.',
      iterate: (shouldStop) => iterateScanFolderDuplicates(db, {
        folders,
        paths,
        excluded,
        mediaTypeId: req.body?.mediaTypeId ?? req.body?.type?.id ?? null,
        shouldStop,
      }),
    })
  }

  const relinkMissingMedia = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const matches = Array.isArray(req.body?.matches) ? req.body.matches : []
      let updated = 0

      for (const item of matches) {
        const filePath = item.newPath || item.path
        const mediaId = item.id

        if (!filePath || !mediaId) continue

        const parsed = parseMediaFilePath(filePath)
        const data: AnyRecord = {
          path: parsed.path,
          basename: parsed.basename,
          name: parsed.name,
          ext: parsed.ext,
        }

        if (item.oshash) {
          data.oshash = item.oshash
        }

        mediaRepo.updateById(Number(mediaId), data, {silent: true})

        updated += 1
      }

      sendOk(res, {updated})
    } catch (err) {
      sendControllerError(res, err, "Some error occurred while relinking missing media.")
    }
  }

  const tagImageAiUpscaleStatus = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const status = await getTagImageAiUpscaleStatus(db)
      sendOk(res, status)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while checking tag image AI upscale status.')
    }
  }

  const streamTagImageAiUpscale = async (req: ApiRequest, res: ApiResponse) => {
    await runNdjsonAsyncGenerator(req, res, {
      errorMessage: 'Some error occurred while upscaling tag images.',
      iterate: (shouldStop) => iterateTagImageAiUpscale(db, {shouldStop}),
    })
  }

  return {
    contentHashBackfillStatus,
    oshashBackfillStatus,
    fingerprintBackfillStatus,
    streamContentHashBackfill,
    streamOshashBackfill,
    streamFingerprintBackfill,
    visualHashBackfillStatus,
    streamVisualHashBackfill,
    videoCodecBackfillStatus,
    streamVideoCodecBackfill,
    imageThumbsGenerationStatus,
    streamImageThumbsGeneration,
    videoImagesGenerationStatus,
    streamVideoImagesGeneration,
    missingMediaStatus,
    streamFindMissingMedia,
    streamScanFolderDuplicates,
    relinkMissingMedia,
    tagImageAiUpscaleStatus,
    streamTagImageAiUpscale,
  }
}
