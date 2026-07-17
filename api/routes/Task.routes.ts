import type { ApiDb } from '../types/db'
import type { Express, RequestHandler, Router } from 'express'
import { apiErrorMessage, apiErrorStack } from '../types/errors'
import express from 'express'
import { validateBody, validateQuery } from '../middleware/validateBody'
import {
  PathPayloadSchema,
  CheckFilesPayloadSchema,
  AddMediaRequestSchema,
  ParsePathTagsRequestSchema,
  ApplyParseLibraryTagsRequestSchema,
  RenameFileRequestSchema,
  OpenPathRequestSchema,
  GetFileListRequestSchema,
  UpdateMediaInfoRequestSchema,
  SearchMediaByPathRequestSchema,
  UpdateMediaMultipleRequestSchema,
  DatabaseSizesRequestSchema,
  DeleteDbRequestSchema,
  FolderSizeRequestSchema,
  ClearDataRequestSchema,
  CreateThumbRequestSchema,
  CreateImageRequestSchema,
  CreateMarkThumbRequestSchema,
  VideoPreviewTaskRequestSchema,
  SuggestTagsRequestSchema,
  BackupNameRequestSchema,
} from '../../shared/schemas/requests'
import createTaskController from '../controllers/Task.controller'
import createTaskVideoCoreController from '../controllers/taskVideoCore.controller'
import createTasksMigrateFromLowDbController from '../controllers/tasks/TasksMigrateFromLowDb.controller'

type TaskHandlers = Record<string, RequestHandler | undefined>

export default function registerRoutes(app: Express, db: ApiDb) {
  const router = express.Router()

  let Task: TaskHandlers
  try {
    Task = createTaskController(db)
  } catch (err) {
    console.error(
      'Task.controller unavailable, using video core fallback:',
      apiErrorStack(err) || apiErrorMessage(err),
    )
    Task = createTaskVideoCoreController(db)
  }

  let TasksMigrateFromLowDb: TaskHandlers | null = null
  try {
    TasksMigrateFromLowDb = createTasksMigrateFromLowDbController(db) as unknown as TaskHandlers
  } catch (err) {
    console.error(
      'Migration Task routes unavailable:',
      apiErrorStack(err) || apiErrorMessage(err),
    )
  }

  if (TasksMigrateFromLowDb) {
    router.post('/checkDataForMigrateFromLowDb', TasksMigrateFromLowDb.checkDataForMigrateFromLowDb!)
    router.post('/cleanLowDb', TasksMigrateFromLowDb.cleanDataLowDb!)
    router.post('/createBackupLowDb', TasksMigrateFromLowDb.createBackupLowDb!)
    router.post('/migrateFromLowDb', TasksMigrateFromLowDb.migrateFromLowDb!)
  }

  const register = (
    method: 'get' | 'post',
    route: string,
    handler: string,
    middleware?: RequestHandler | RequestHandler[],
  ) => {
    const taskHandler = Task[handler]
    if (typeof taskHandler !== 'function') return
    const middlewares = Array.isArray(middleware) ? middleware : middleware ? [middleware] : []
    const routeHandler = router[method].bind(router) as Router['post']
    routeHandler(route, ...middlewares, taskHandler)
  }

  register('post', '/checkFileExists', 'checkFileExists', validateBody(PathPayloadSchema))
  register('post', '/checkFilesExists', 'checkFilesExists', validateBody(CheckFilesPayloadSchema))
  register('post', '/renameFile', 'renameFile', validateBody(RenameFileRequestSchema))
  register('post', '/openPath', 'openPath', validateBody(OpenPathRequestSchema))
  register('post', '/getFileList', 'getFileList', validateBody(GetFileListRequestSchema))

  register('post', '/addMedia', 'addMedia', validateBody(AddMediaRequestSchema))
  register('post', '/addMediaVideo', 'addMediaVideo', validateBody(AddMediaRequestSchema))
  register('post', '/addMediaImage', 'addMediaImage', validateBody(AddMediaRequestSchema))
  register('post', '/addMediaAudio', 'addMediaAudio', validateBody(AddMediaRequestSchema))
  register('post', '/addMediaText', 'addMediaText', validateBody(AddMediaRequestSchema))

  register('post', '/updateMediaInfo', 'updateMediaInfo', validateBody(UpdateMediaInfoRequestSchema))
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
  register('post', '/getDatabaseSizes', 'getDatabaseSizes', validateBody(DatabaseSizesRequestSchema))
  register('post', '/getFolderSize', 'getFolderSize', validateBody(FolderSizeRequestSchema))
  register('post', '/clearData', 'clearData', validateBody(ClearDataRequestSchema))
  register('post', '/searchMediaByPath', 'searchMediaByPath', validateBody(SearchMediaByPathRequestSchema))
  register('post', '/updateMediaMultiple', 'updateMediaMultiple', validateBody(UpdateMediaMultipleRequestSchema))

  register('get', '/getMostPopularWordsFromMedia', 'getMostPopularWordsFromMedia')
  register('get', '/suggestTagsFromPaths', 'suggestTagsFromPaths', validateQuery(SuggestTagsRequestSchema))
  register('post', '/suggestTagsFromPaths', 'suggestTagsFromPaths', validateBody(SuggestTagsRequestSchema))
  register('post', '/suggestTagsFromVideoFrames', 'suggestTagsFromVideoFrames', validateBody(SuggestTagsRequestSchema))
  register('post', '/streamVideoObjectRecognition', 'streamVideoObjectRecognition', validateBody(SuggestTagsRequestSchema))

  register('get', '/clipModelStatus', 'clipModelStatus')
  register('post', '/downloadClipModel', 'downloadClipModel', validateBody(BackupNameRequestSchema))

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
  register('get', '/videoCodecBackfillStatus', 'videoCodecBackfillStatus')
  register('post', '/streamVideoCodecBackfill', 'streamVideoCodecBackfill')
  register('get', '/videoImagesGenerationStatus', 'videoImagesGenerationStatus')
  register('post', '/streamVideoImagesGeneration', 'streamVideoImagesGeneration')
  register('get', '/imageThumbsGenerationStatus', 'imageThumbsGenerationStatus')
  register('post', '/streamImageThumbsGeneration', 'streamImageThumbsGeneration')
  register('get', '/missingMediaStatus', 'missingMediaStatus')
  register('post', '/streamFindMissingMedia', 'streamFindMissingMedia')
  register('post', '/relinkMissingMedia', 'relinkMissingMedia')
  register('post', '/streamScanFolderDuplicates', 'streamScanFolderDuplicates')

  app.use('/api/Task', router)
}
