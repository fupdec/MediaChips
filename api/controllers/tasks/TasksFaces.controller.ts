import type { TaskControllerShared } from '../../types/tasks'
import type { ApiRequest, ApiResponse } from '../../types/http'
import { HttpError, sendControllerError, sendOk } from '../../types/errors'
import { runNdjsonAsyncGenerator } from './ndjsonStreamRunner'
import {
  detectMedia,
  getFaceDetectionStatus,
  getStatus,
  prepareDetectModel,
} from '../../services/faceDetector'
import {iterateFaceDetection} from '../../services/faceDetectOrchestrate'
import {
  assignFaceToPerformer,
  clearFaceMatch,
  enrollTagFaces,
  getEmbedStatus,
  getFaceMatchSettings,
  getFaceMatchStatus,
  iterateEnrollFromPerformerImages,
  iterateFaceMatching,
  listFacesForMedia,
  matchMediaFaces,
  prepareEmbedModel,
} from '../../services/faceRecognition'
import {
  getEnrollmentQualityForTag,
  iterateEnrollmentQualityReport,
} from '../../services/enrollmentQuality'
import { createMediaRepository } from '../../db/repositories/media'
import { resolveExistingPath } from '../../services/contentHash'
import { iteratePreparedModelDownload } from '../../services/modelDownloadStream'

export default function createTasksFacesController(shared: TaskControllerShared) {
  const {db} = shared

  const mediaRepo = createMediaRepository(db.drizzle)

  const faceModelStatus = async (_req: ApiRequest, res: ApiResponse) => {
    try {
      sendOk(res, getStatus(db))
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while checking face model status.')
    }
  }

  const downloadFaceModel = async (req: ApiRequest, res: ApiResponse) => {
    await runNdjsonAsyncGenerator(req, res, {
      errorMessage: 'Some error occurred while downloading face model.',
      iterate: (shouldStop) => iteratePreparedModelDownload(
        prepareDetectModel,
        getStatus,
        db,
        {shouldStop},
      ),
    })
  }

  const faceEmbedModelStatus = async (_req: ApiRequest, res: ApiResponse) => {
    try {
      sendOk(res, getEmbedStatus(db))
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while checking face embed model status.')
    }
  }

  const downloadFaceEmbedModel = async (req: ApiRequest, res: ApiResponse) => {
    await runNdjsonAsyncGenerator(req, res, {
      errorMessage: 'Some error occurred while downloading face embed model.',
      iterate: (shouldStop) => iteratePreparedModelDownload(
        prepareEmbedModel,
        getEmbedStatus,
        db,
        {shouldStop},
      ),
    })
  }

  const faceDetectionStatus = async (_req: ApiRequest, res: ApiResponse) => {
    try {
      sendOk(res, await getFaceDetectionStatus(db))
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while checking face detection status.')
    }
  }

  const faceMatchStatus = async (_req: ApiRequest, res: ApiResponse) => {
    try {
      sendOk(res, getFaceMatchStatus(db))
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while checking face match status.')
    }
  }

  const facesForMedia = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const mediaId = Number(req.query?.mediaId || req.body?.mediaId || req.body?.id)
      if (!Number.isFinite(mediaId) || mediaId <= 0) {
        throw new HttpError(400, 'mediaId is required')
      }
      const ensureCropsRaw = req.query?.ensureCrops ?? req.body?.ensureCrops
      const ensureCrops = !(
        ensureCropsRaw === false
        || ensureCropsRaw === 'false'
        || ensureCropsRaw === '0'
        || ensureCropsRaw === 0
      )
      sendOk(res, await listFacesForMedia(db, mediaId, {ensureCrops}))
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while loading faces.')
    }
  }

  const detectFacesForMedia = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const mediaId = Number(req.body?.mediaId || req.body?.id)
      if (!Number.isFinite(mediaId) || mediaId <= 0) {
        throw new HttpError(400, 'mediaId is required')
      }

      const media = mediaRepo.findById(mediaId)
      if (!media) {
        throw new HttpError(404, 'Media not found')
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
        // Manual Detect faces: keep crops for the review dialog.
        persistCrops: true,
      })

      let match = null
      if (req.body?.match !== false && media.id != null) {
        try {
          match = await matchMediaFaces(db, Number(media.id), {force: Boolean(req.body?.force)})
        } catch {
          match = null
        }
      }

      sendOk(res, {...result, match})
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while detecting faces.')
    }
  }

  const matchFacesForMedia = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const mediaId = Number(req.body?.mediaId || req.body?.id)
      if (!Number.isFinite(mediaId) || mediaId <= 0) {
        throw new HttpError(400, 'mediaId is required')
      }
      const applyTagsRaw = req.body?.applyTags
      const applyTags = !(
        applyTagsRaw === false
        || applyTagsRaw === 'false'
        || applyTagsRaw === 0
        || applyTagsRaw === '0'
      )
      const settings = applyTags
        ? undefined
        : {...getFaceMatchSettings(db), mode: 'suggest' as const}
      const result = await matchMediaFaces(db, mediaId, {
        force: Boolean(req.body?.force),
        settings,
      })
      sendOk(res, result)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while matching faces.')
    }
  }

  const assignFacePerformer = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const faceId = Number(req.body?.faceId)
      const tagId = Number(req.body?.tagId)
      if (!Number.isFinite(faceId) || !Number.isFinite(tagId)) {
        throw new HttpError(400, 'faceId and tagId are required')
      }
      const result = await assignFaceToPerformer(db, faceId, tagId, {
        enroll: req.body?.enroll === true,
        applyTag: req.body?.applyTag === true,
        matchScore: req.body?.matchScore != null ? Number(req.body.matchScore) : undefined,
      })
      sendOk(res, result)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while assigning face to performer.')
    }
  }

  const clearFacePerformer = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const faceId = Number(req.body?.faceId)
      if (!Number.isFinite(faceId) || faceId <= 0) {
        throw new HttpError(400, 'faceId is required')
      }
      sendOk(res, clearFaceMatch(db, faceId))
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while clearing face match.')
    }
  }

  const enrollmentQualityForTag = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const tagId = Number(req.query?.tagId || req.body?.tagId)
      if (!Number.isFinite(tagId) || tagId <= 0) {
        throw new HttpError(400, 'tagId is required')
      }
      sendOk(res, await getEnrollmentQualityForTag(db, tagId))
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while checking enrollment quality.')
    }
  }

  const enrollTagFacesForTag = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const tagId = Number(req.body?.tagId || req.query?.tagId)
      if (!Number.isFinite(tagId) || tagId <= 0) {
        throw new HttpError(400, 'tagId is required')
      }
      const enroll = await enrollTagFaces(db, tagId, {force: req.body?.force !== false})
      let quality = null
      if (!enroll.skipped || enroll.reason !== 'not_people_category') {
        try {
          quality = await getEnrollmentQualityForTag(db, tagId)
        } catch {
          quality = null
        }
      }
      sendOk(res, {...enroll, quality})
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while enrolling tag faces.')
    }
  }

  const streamEnrollmentQualityReport = async (req: ApiRequest, res: ApiResponse) => {
    const metaIdRaw = req.body?.metaId ?? req.query?.metaId
    const metaId = metaIdRaw != null && metaIdRaw !== '' ? Number(metaIdRaw) : null
    await runNdjsonAsyncGenerator(req, res, {
      errorMessage: 'Some error occurred while checking enrollment quality.',
      iterate: (shouldStop) => iterateEnrollmentQualityReport(db, {
        shouldStop,
        metaId: Number.isFinite(metaId as number) ? Number(metaId) : null,
      }),
    })
  }

  const streamFaceDetection = async (req: ApiRequest, res: ApiResponse) => {
    const force = Boolean(req.body?.force) || String(req.query.force || '').toLowerCase() === 'true'
    const mediaIds = Array.isArray(req.body?.mediaIds) ? req.body.mediaIds : undefined
    const paths = Array.isArray(req.body?.paths)
      ? req.body.paths.map((item: unknown) => (
        typeof item === 'string' ? item : (item as {path?: string})?.path
      )).filter(Boolean)
      : undefined
    const applyTagsRaw = req.body?.applyTags
    const applyTags = !(
      applyTagsRaw === false
      || applyTagsRaw === 'false'
      || applyTagsRaw === 0
      || applyTagsRaw === '0'
    )
    const autoBlindTagsRaw = req.body?.autoBlindTags
    const autoBlindTags = (
      autoBlindTagsRaw === true
      || autoBlindTagsRaw === 'true'
      || autoBlindTagsRaw === 1
      || autoBlindTagsRaw === '1'
    )
    await runNdjsonAsyncGenerator(req, res, {
      errorMessage: 'Some error occurred while detecting faces.',
      iterate: (shouldStop) => iterateFaceDetection(db, {
        shouldStop,
        force,
        mediaIds,
        paths,
        framesPerVideo: req.body?.framesPerVideo,
        minScore: req.body?.minScore,
        applyTags,
        autoBlindTags: autoBlindTags || undefined,
      }),
    })
  }

  const streamFaceEnrollment = async (req: ApiRequest, res: ApiResponse) => {
    const force = Boolean(req.body?.force) || String(req.query.force || '').toLowerCase() === 'true'
    const metaId = req.body?.metaId != null ? Number(req.body.metaId) : undefined
    await runNdjsonAsyncGenerator(req, res, {
      errorMessage: 'Some error occurred while enrolling performer faces.',
      iterate: (shouldStop) => iterateEnrollFromPerformerImages(db, {
        shouldStop,
        force,
        metaId,
      }),
    })
  }

  const streamFaceMatching = async (req: ApiRequest, res: ApiResponse) => {
    const force = Boolean(req.body?.force) || String(req.query.force || '').toLowerCase() === 'true'
    const mediaIds = Array.isArray(req.body?.mediaIds) ? req.body.mediaIds.map(Number) : undefined
    await runNdjsonAsyncGenerator(req, res, {
      errorMessage: 'Some error occurred while matching faces.',
      iterate: (shouldStop) => iterateFaceMatching(db, {
        shouldStop,
        force,
        mediaIds,
      }),
    })
  }

  return {
    faceModelStatus,
    downloadFaceModel,
    faceEmbedModelStatus,
    downloadFaceEmbedModel,
    faceDetectionStatus,
    faceMatchStatus,
    facesForMedia,
    detectFacesForMedia,
    matchFacesForMedia,
    assignFacePerformer,
    clearFacePerformer,
    enrollmentQualityForTag,
    enrollTagFacesForTag,
    streamEnrollmentQualityReport,
    streamFaceDetection,
    streamFaceEnrollment,
    streamFaceMatching,
  }
}
