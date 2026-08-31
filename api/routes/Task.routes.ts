import type { ApiDb } from '../types/db'
import type { Express, NextFunction, Request, RequestHandler, Response, Router } from 'express'
import { apiErrorMessage, apiErrorStack } from '../types/errors'
import express from 'express'
import { validateBody, validateQuery } from '../middleware/validateBody'
import {
  PathPayloadSchema,
  CheckFilesPayloadSchema,
  AddMediaRequestSchema,
  AddMediaBulkRequestSchema,
  ParsePathTagsRequestSchema,
  ApplyParseLibraryTagsRequestSchema,
  RenameFileRequestSchema,
  OpenPathRequestSchema,
  OpenInExternalPlayerRequestSchema,
  GetFileListRequestSchema,
  UpdateMediaInfoRequestSchema,
  EnsureMediaMetadataBulkRequestSchema,
  SearchMediaByPathRequestSchema,
  UpdateMediaMultipleRequestSchema,
  DatabaseSizesRequestSchema,
  DeleteDbRequestSchema,
  DuplicateDbRequestSchema,
  MergeLibraryRequestSchema,
  FolderSizeRequestSchema,
  ClearDataRequestSchema,
  CreateThumbRequestSchema,
  CreateImageRequestSchema,
  CreateMarkThumbRequestSchema,
  VideoPreviewTaskRequestSchema,
  ConvertVideosRequestSchema,
  TestVideoSegmentRequestSchema,
  TrimVideoRequestSchema,
  TrimVideoDeleteOriginalRequestSchema,
  SuggestTagsRequestSchema,
  BackupNameRequestSchema,
  FaceMediaIdRequestSchema,
  FaceAssignRequestSchema,
  FaceClearRequestSchema,
  FaceTagIdRequestSchema,
  FaceTagIdQuerySchema,
  FaceStreamDetectionRequestSchema,
  FaceStreamEnrollmentRequestSchema,
  FaceStreamMatchingRequestSchema,
  FaceEnrollmentQualityReportRequestSchema,
  AutoChapterStreamRequestSchema,
  GenerateAutoChaptersRequestSchema,
  ExportMarkClipsRequestSchema,
} from '../../shared/schemas/requests'

type TaskHandlers = Record<string, RequestHandler | undefined>

function loadTaskHandlers(db: ApiDb): TaskHandlers {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const createTaskController = require('../controllers/Task.controller').default as (
      database: ApiDb,
    ) => TaskHandlers
    return createTaskController(db)
  } catch (err) {
    console.error(
      'Task.controller unavailable, using video core fallback:',
      apiErrorStack(err) || apiErrorMessage(err),
    )
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const createTaskVideoCoreController = require('../controllers/taskVideoCore.controller').default as (
      database: ApiDb,
    ) => TaskHandlers
    return createTaskVideoCoreController(db)
  }
}

function loadMigrateHandlers(db: ApiDb): TaskHandlers | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const createTasksMigrateFromLowDbController = require(
      '../controllers/tasks/TasksMigrateFromLowDb.controller',
    ).default as (database: ApiDb) => TaskHandlers
    return createTasksMigrateFromLowDbController(db)
  } catch (err) {
    console.error(
      'Migration Task routes unavailable:',
      apiErrorStack(err) || apiErrorMessage(err),
    )
    return null
  }
}

export default function registerRoutes(app: Express, db: ApiDb) {
  const router = express.Router()

  let taskHandlers: TaskHandlers | null = null
  const getTask = (): TaskHandlers => {
    taskHandlers ??= loadTaskHandlers(db)
    return taskHandlers
  }

  let migrateHandlers: TaskHandlers | null | undefined
  const getMigrate = (): TaskHandlers | null => {
    if (migrateHandlers === undefined) {
      migrateHandlers = loadMigrateHandlers(db)
    }
    return migrateHandlers
  }

  const lazyMigrate = (handler: string): RequestHandler => {
    return (req, res, next) => {
      const handlers = getMigrate()
      const fn = handlers?.[handler]
      if (typeof fn !== 'function') {
        res.sendStatus(404)
        return
      }
      return fn(req, res, next)
    }
  }

  router.post('/checkDataForMigrateFromLowDb', lazyMigrate('checkDataForMigrateFromLowDb'))
  router.post('/cleanLowDb', lazyMigrate('cleanDataLowDb'))
  router.post('/createBackupLowDb', lazyMigrate('createBackupLowDb'))
  router.post('/migrateFromLowDb', lazyMigrate('migrateFromLowDb'))

  const register = (
    method: 'get' | 'post',
    route: string,
    handler: string,
    middleware?: RequestHandler | RequestHandler[],
  ) => {
    const middlewares = Array.isArray(middleware) ? middleware : middleware ? [middleware] : []
    const routeHandler = router[method].bind(router) as Router['post']
    const lazyHandler: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
      const taskHandler = getTask()[handler]
      if (typeof taskHandler !== 'function') {
        res.sendStatus(404)
        return
      }
      return taskHandler(req, res, next)
    }
    routeHandler(route, ...middlewares, lazyHandler)
  }

  register('post', '/convertVideos', 'convertVideos', validateBody(ConvertVideosRequestSchema))
  register('post', '/createTestVideoSegment', 'createTestVideoSegment', validateBody(TestVideoSegmentRequestSchema))
  register('post', '/trimVideo', 'trimVideo', validateBody(TrimVideoRequestSchema))
  register('post', '/trimDeleteOriginal', 'trimDeleteOriginal', validateBody(TrimVideoDeleteOriginalRequestSchema))
  register('get', '/trim/:jobId', 'trimStatus')
  register('post', '/trim/:jobId/cancel', 'cancelTrim')
  register('get', '/conversion/:jobId', 'conversionStatus')
  register('post', '/conversion/cancel-all', 'cancelAllConversions')
  register('post', '/conversion/:jobId/cancel', 'cancelConversion')

  register('post', '/checkFileExists', 'checkFileExists', validateBody(PathPayloadSchema))
  register('post', '/checkFilesExists', 'checkFilesExists', validateBody(CheckFilesPayloadSchema))
  register('post', '/renameFile', 'renameFile', validateBody(RenameFileRequestSchema))
  register('post', '/openPath', 'openPath', validateBody(OpenPathRequestSchema))
  register('post', '/openInExternalPlayer', 'openInExternalPlayer', validateBody(OpenInExternalPlayerRequestSchema))
  register('post', '/getFileList', 'getFileList', validateBody(GetFileListRequestSchema))

  register('post', '/addMedia', 'addMedia', validateBody(AddMediaRequestSchema))
  register('post', '/addMediaBulk', 'addMediaBulk', validateBody(AddMediaBulkRequestSchema))
  register('post', '/addMediaVideo', 'addMediaVideo', validateBody(AddMediaRequestSchema))
  register('post', '/addMediaImage', 'addMediaImage', validateBody(AddMediaRequestSchema))
  register('post', '/addMediaAudio', 'addMediaAudio', validateBody(AddMediaRequestSchema))
  register('post', '/addMediaText', 'addMediaText', validateBody(AddMediaRequestSchema))

  register('post', '/updateMediaInfo', 'updateMediaInfo', validateBody(UpdateMediaInfoRequestSchema))
  register('post', '/ensureImageDimensions', 'ensureImageDimensions', validateBody(UpdateMediaInfoRequestSchema))
  register('post', '/ensureMediaMetadataBulk', 'ensureMediaMetadataBulk', validateBody(EnsureMediaMetadataBulkRequestSchema))
  register('post', '/createThumbForVideo', 'createThumbForVideo', validateBody(VideoPreviewTaskRequestSchema))
  register('post', '/createThumb', 'createThumb', validateBody(CreateThumbRequestSchema))
  register('post', '/createMarkThumbForMark', 'createMarkThumbForMark', validateBody(CreateMarkThumbRequestSchema))
  register('post', '/createGrid', 'createGrid', validateBody(VideoPreviewTaskRequestSchema))
  register('post', '/createTimeline', 'createTimeline', validateBody(VideoPreviewTaskRequestSchema))

  register('get', '/getConfig', 'getConfig')
  register('get', '/getMachineId', 'getMachineId')

  register('post', '/createImage', 'createImage', validateBody(CreateImageRequestSchema))
  register('post', '/deleteFile', 'deleteFile', validateBody(PathPayloadSchema))
  register('post', '/deleteDb', 'deleteDb', validateBody(DeleteDbRequestSchema))
  register('post', '/duplicateDb', 'duplicateDb', validateBody(DuplicateDbRequestSchema))
  register('post', '/streamMergeLibrary', 'streamMergeLibrary', validateBody(MergeLibraryRequestSchema))
  register('post', '/getDatabaseSizes', 'getDatabaseSizes', validateBody(DatabaseSizesRequestSchema))
  register('post', '/getFolderSize', 'getFolderSize', validateBody(FolderSizeRequestSchema))
  register('post', '/clearData', 'clearData', validateBody(ClearDataRequestSchema))
  register('post', '/searchMediaByPath', 'searchMediaByPath', validateBody(SearchMediaByPathRequestSchema))
  register('post', '/updateMediaMultiple', 'updateMediaMultiple', validateBody(UpdateMediaMultipleRequestSchema))

  register('get', '/getMostPopularWordsFromMedia', 'getMostPopularWordsFromMedia')
  register('get', '/suggestTagsFromPaths', 'suggestTagsFromPaths', validateQuery(SuggestTagsRequestSchema))
  register('post', '/suggestTagsFromPaths', 'suggestTagsFromPaths', validateBody(SuggestTagsRequestSchema))
  register('get', '/clipModelStatus', 'clipModelStatus')
  register('post', '/downloadClipModel', 'downloadClipModel', validateBody(BackupNameRequestSchema))

  register('get', '/faceModelStatus', 'faceModelStatus')
  register('post', '/downloadFaceModel', 'downloadFaceModel', validateBody(BackupNameRequestSchema))
  register('get', '/faceEmbedModelStatus', 'faceEmbedModelStatus')
  register('post', '/downloadFaceEmbedModel', 'downloadFaceEmbedModel', validateBody(BackupNameRequestSchema))
  register('get', '/faceDetectionStatus', 'faceDetectionStatus')
  register('get', '/faceMatchStatus', 'faceMatchStatus')
  register('get', '/facesForMedia', 'facesForMedia', validateQuery(FaceMediaIdRequestSchema))
  register('post', '/detectFacesForMedia', 'detectFacesForMedia', validateBody(FaceMediaIdRequestSchema))
  register('post', '/matchFacesForMedia', 'matchFacesForMedia', validateBody(FaceMediaIdRequestSchema))
  register('post', '/assignFacePerformer', 'assignFacePerformer', validateBody(FaceAssignRequestSchema))
  register('post', '/clearFacePerformer', 'clearFacePerformer', validateBody(FaceClearRequestSchema))
  register('get', '/enrollmentQualityForTag', 'enrollmentQualityForTag', validateQuery(FaceTagIdQuerySchema))
  register('post', '/enrollTagFaces', 'enrollTagFacesForTag', validateBody(FaceTagIdRequestSchema))
  register('post', '/streamEnrollmentQualityReport', 'streamEnrollmentQualityReport', validateBody(FaceEnrollmentQualityReportRequestSchema))
  register('post', '/streamFaceDetection', 'streamFaceDetection', validateBody(FaceStreamDetectionRequestSchema))
  register('post', '/streamFaceEnrollment', 'streamFaceEnrollment', validateBody(FaceStreamEnrollmentRequestSchema))
  register('post', '/streamFaceMatching', 'streamFaceMatching', validateBody(FaceStreamMatchingRequestSchema))

  register('post', '/parsePathTags', 'parsePathTags', validateBody(ParsePathTagsRequestSchema))
  register('get', '/parseLibraryTagsStatus', 'parseLibraryTagsStatus')
  register('post', '/streamParseLibraryTagsPreview', 'streamParseLibraryTagsPreview')
  register('post', '/applyParseLibraryTags', 'applyParseLibraryTagsPreview', validateBody(ApplyParseLibraryTagsRequestSchema))

  register('get', '/parserStatus', 'parserStatus')
  register('post', '/downloadParserModel', 'downloadParserModel', validateBody(BackupNameRequestSchema))

  register('get', '/contentHashBackfillStatus', 'contentHashBackfillStatus')
  register('post', '/streamContentHashBackfill', 'streamContentHashBackfill')
  register('get', '/oshashBackfillStatus', 'oshashBackfillStatus')
  register('post', '/streamOshashBackfill', 'streamOshashBackfill')
  register('get', '/fingerprintBackfillStatus', 'fingerprintBackfillStatus')
  register('post', '/streamFingerprintBackfill', 'streamFingerprintBackfill')
  register('get', '/visualHashBackfillStatus', 'visualHashBackfillStatus')
  register('post', '/streamVisualHashBackfill', 'streamVisualHashBackfill')
  register('get', '/clipEmbeddingBackfillStatus', 'clipEmbeddingBackfillStatus')
  register('post', '/streamClipEmbeddingBackfill', 'streamClipEmbeddingBackfill')
  register('get', '/videoCodecBackfillStatus', 'videoCodecBackfillStatus')
  register('post', '/streamVideoCodecBackfill', 'streamVideoCodecBackfill')
  register('get', '/mediaCreatedBackfillStatus', 'mediaCreatedBackfillStatus')
  register('post', '/streamMediaCreatedBackfill', 'streamMediaCreatedBackfill')
  register('get', '/videoImagesGenerationStatus', 'videoImagesGenerationStatus')
  register('post', '/streamVideoImagesGeneration', 'streamVideoImagesGeneration')
  register('get', '/visualSearchQuickSample', 'visualSearchQuickSample')
  register('get', '/autoChapterGenerationStatus', 'autoChapterGenerationStatus')
  register('post', '/generateAutoChapters', 'generateAutoChapters', validateBody(GenerateAutoChaptersRequestSchema))
  register('post', '/streamAutoChapterGeneration', 'streamAutoChapterGeneration', validateBody(AutoChapterStreamRequestSchema))
  register('get', '/imageThumbsGenerationStatus', 'imageThumbsGenerationStatus')
  register('post', '/streamImageThumbsGeneration', 'streamImageThumbsGeneration')
  register('get', '/tagImageAiUpscaleStatus', 'tagImageAiUpscaleStatus')
  register('post', '/streamTagImageAiUpscale', 'streamTagImageAiUpscale')
  register('get', '/localAiStatus', 'localAiStatus')
  register('post', '/setLocalAiEnabled', 'setLocalAiEnabled')
  register('post', '/downloadLocalAi', 'streamDownloadLocalAi')
  register('post', '/deleteLocalAi', 'deleteLocalAi')
  register('post', '/localAiChat', 'streamLocalAiChat')
  register('get', '/localAiTools', 'localAiTools')
  register('get', '/missingMediaStatus', 'missingMediaStatus')
  register('post', '/streamFindMissingMedia', 'streamFindMissingMedia')
  register('post', '/relinkMissingMedia', 'relinkMissingMedia')
  register('post', '/streamScanFolderDuplicates', 'streamScanFolderDuplicates')
  register('post', '/exportMarkClips', 'exportMarkClips', validateBody(ExportMarkClipsRequestSchema))

  app.use('/api/Task', router)
}
