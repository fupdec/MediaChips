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
import {
  getClipEmbeddingBackfillStatus,
  iterateClipEmbeddingBackfill,
} from '../../services/mediaClipEmbeddings'
import {
  generateAutoChaptersForMedia,
  getAutoChapterGenerationStatus,
  iterateAutoChapterGeneration,
} from '../../services/autoChapterDetect'
import {iterateMarkClipsExport} from '../../services/markClipsExport'

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

  const autoChapterGenerationStatus = async (_req: ApiRequest, res: ApiResponse) => {
    try {
      sendOk(res, getAutoChapterGenerationStatus(db))
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while checking auto chapter status.')
    }
  }

  const generateAutoChapters = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const mediaId = Number(req.body?.mediaId)
      if (!Number.isFinite(mediaId) || mediaId <= 0) {
        sendControllerError(res, new Error('mediaId is required'), 'mediaId is required')
        return
      }
      const result = await generateAutoChaptersForMedia(db, mediaId, {
        force: Boolean(req.body?.force),
        threshold: req.body?.threshold != null ? Number(req.body.threshold) : undefined,
        minGapSec: req.body?.minGapSec != null ? Number(req.body.minGapSec) : undefined,
        maxChapters: req.body?.maxChapters != null ? Number(req.body.maxChapters) : undefined,
        useSilence: req.body?.useSilence != null ? Boolean(req.body.useSilence) : true,
      })
      sendOk(res, result)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while generating auto chapters.')
    }
  }

  const streamAutoChapterGeneration = async (req: ApiRequest, res: ApiResponse) => {
    const force = Boolean(req.body?.force) || String(req.query.force || '').toLowerCase() === 'true'
    const mediaIds = Array.isArray(req.body?.mediaIds) ? req.body.mediaIds : undefined
    await runNdjsonAsyncGenerator(req, res, {
      errorMessage: 'Some error occurred while generating auto chapters.',
      iterate: (shouldStop) => iterateAutoChapterGeneration(db, {
        shouldStop,
        force,
        mediaIds,
        threshold: req.body?.threshold != null ? Number(req.body.threshold) : undefined,
        minGapSec: req.body?.minGapSec != null ? Number(req.body.minGapSec) : undefined,
        maxChapters: req.body?.maxChapters != null ? Number(req.body.maxChapters) : undefined,
        useSilence: req.body?.useSilence != null ? Boolean(req.body.useSilence) : true,
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

  const clipEmbeddingBackfillStatus = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const status = await getClipEmbeddingBackfillStatus(db)
      sendOk(res, status)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while checking CLIP embedding status.')
    }
  }

  const streamClipEmbeddingBackfill = async (req: ApiRequest, res: ApiResponse) => {
    const mediaIds = Array.isArray(req.body?.mediaIds) ? req.body.mediaIds : undefined
    await runNdjsonAsyncGenerator(req, res, {
      errorMessage: 'Some error occurred while backfilling CLIP embeddings.',
      iterate: (shouldStop) => iterateClipEmbeddingBackfill(db, {
        shouldStop,
        force: Boolean(req.body?.force) || String(req.query.force || '').toLowerCase() === 'true',
        mediaIds,
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

  const exportMarkClips = async (req: ApiRequest, res: ApiResponse) => {
    const markIds = Array.isArray(req.body?.markIds)
      ? req.body.markIds.map(Number).filter((id: number) => Number.isFinite(id) && id > 0)
      : []
    const outputPath = typeof req.body?.outputPath === 'string' ? req.body.outputPath : undefined
    const sort = req.body?.sort === 'shuffle' ? 'shuffle' as const : 'time' as const

    await runNdjsonAsyncGenerator(req, res, {
      errorMessage: 'Some error occurred while exporting mark clips.',
      iterate: (shouldStop) => iterateMarkClipsExport(db, {
        markIds,
        outputPath,
        sort,
        shouldStop,
      }),
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
    clipEmbeddingBackfillStatus,
    streamClipEmbeddingBackfill,
    videoCodecBackfillStatus,
    streamVideoCodecBackfill,
    imageThumbsGenerationStatus,
    streamImageThumbsGeneration,
    videoImagesGenerationStatus,
    streamVideoImagesGeneration,
    autoChapterGenerationStatus,
    generateAutoChapters,
    streamAutoChapterGeneration,
    missingMediaStatus,
    streamFindMissingMedia,
    streamScanFolderDuplicates,
    relinkMissingMedia,
    tagImageAiUpscaleStatus,
    streamTagImageAiUpscale,
    exportMarkClips,
  }
}
