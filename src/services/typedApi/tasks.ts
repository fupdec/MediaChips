import { apiClient } from '../apiClient'
import {
  API_ROUTES,
  apiTab,
  apiWatchedFolder,
} from '@shared/api/routes'
import type {
  WatchedFolderCreatePayload,
  WatchedFolderUpdatePayload,
  VideoTimelineTaskPayload,
} from '@shared/api/responses'
import type {
  AddMediaPayload,
  BackupNamePayload,
  BulkMetaApplyPayload,
  ConfigUpdatePayload,
  CreateImagePayload,
  CreateMarkThumbPayload,
  CreateThumbPayload,
  DatabaseSizesPayload,
  FolderSizePayload,
  GetFileBlobPayload,
  GetFileListPayload,
  SearchMediaByPathPayload,
  TabCreatePayload,
  TabUpdatePayload,
  UpdateMediaMultiplePayload,
  VideoPreviewTaskPayload,
} from '@shared/api/payloads'
import {buildVideoGridTaskParams} from '@shared/videoPreview'
import {
  parseAddMediaResponse,
  parseBackupList,
  parseClipModelStatus,
  parseDatabaseSizesResponse,
  parseFileExistsResponse,
  parseCheckFilesResponse,
  parseFileListResponse,
  parseFolderSizeResponse,
  parseMediaPathSearchResults,
  parseResolvePathResponse,
  parseTab,
  parseWatchedFolderLinks,
} from '@shared/schemas'
import {
  AddMediaRequestSchema,
  DatabaseSizesRequestSchema,
  CheckFilesPayloadSchema,
  FolderSizeRequestSchema,
  PathPayloadSchema,
} from '@shared/schemas/requests'
import { validated, validateRequest } from './validate'
import {ApiHttpError, fetchApiJson, postApiNdjsonStream} from '../ndjsonStream'

export type VideoImagesGenerationStatus = Record<'preview' | 'grid' | 'marks', {
  total?: number
  pending?: number
  generated?: number
}>

export type ImageThumbsGenerationStatus = {
  total?: number
  pending?: number
  generated?: number
}

export type TagImageAiUpscaleStatus = {
  done?: boolean
  pendingCount?: number
  byType?: Record<string, number>
  downloadSizeMb?: number
  suggested?: boolean
}

export type GenerationStreamEvent = {
  type: string
  processed?: number
  total?: number
  created?: number
  skipped?: number
  missing?: number
  failed?: number
  upscaled?: number
  current?: string
  path?: string
  message?: string
  stopped?: boolean
  downloadSizeMb?: number
  orphansDeleted?: number
  foldersRemoved?: number
  foldersCreated?: number
  imagesResized?: number
}

export {ApiHttpError}

export const tasksApi = {
  checkFileExists(path: string) {
    const body = validateRequest(PathPayloadSchema, { path })
    return apiClient.post(API_ROUTES.taskCheckFileExists, body).then((res) => ({
      ...res,
      data: validated(parseFileExistsResponse, res.data),
    }))
  },

  checkFilesExist(paths: string[]) {
    const body = validateRequest(CheckFilesPayloadSchema, { paths })
    return apiClient.post(API_ROUTES.taskCheckFilesExists, body).then((res) => ({
      ...res,
      data: validated(parseCheckFilesResponse, res.data),
    }))
  },

  resolvePath(filePath: string) {
    return apiClient.post(API_ROUTES.resolvePath, { filePath }).then((res) => ({
      ...res,
      data: validated(parseResolvePathResponse, res.data),
    }))
  },

  getFileBlob(body: GetFileBlobPayload) {
    return apiClient.post<Blob>(API_ROUTES.getFile, body, { responseType: 'blob' })
  },

  createThumb(body: CreateThumbPayload) {
    return apiClient.post(API_ROUTES.taskCreateThumb, body)
  },

  deleteLocalFile(path: string) {
    return apiClient.post(API_ROUTES.taskDeleteFile, { path })
  },

  createImage(body: CreateImagePayload) {
    return apiClient.post(API_ROUTES.taskCreateImage, body)
  },

  createMarkThumb(body: CreateMarkThumbPayload) {
    return apiClient.post(API_ROUTES.taskCreateMarkThumb, body)
  },

  updateMediaInfo(id: number) {
    return apiClient.post(API_ROUTES.taskUpdateMediaInfo, { id })
  },

  openPath(body: { path: string; isDir?: boolean }) {
    return apiClient.post(API_ROUTES.taskOpenPath, body)
  },

  openInExternalPlayer(body: { path: string; player: 'mpv' | 'iina'; mediaId?: number }) {
    return apiClient.post(API_ROUTES.taskOpenInExternalPlayer, body)
  },

  updateConfig(data: ConfigUpdatePayload) {
    return apiClient.post(API_ROUTES.updateConfig, data)
  },

  switchDatabase(body: { databaseId: string }) {
    return apiClient.post(API_ROUTES.switchDatabase, body)
  },

  getFileList(body: GetFileListPayload) {
    return apiClient.post(API_ROUTES.taskGetFileList, body).then((res) => ({
      ...res,
      data: validated(parseFileListResponse, res.data),
    }))
  },

  postTaskEndpoint<T = unknown>(endpoint: string, body: Record<string, unknown>) {
    return apiClient.post<T>(`/api/Task/${endpoint}`, body)
  },

  addMedia(body: AddMediaPayload) {
    const payload = validateRequest(AddMediaRequestSchema, body)
    return apiClient.post('/api/Task/addMedia', payload).then((res) => ({
      ...res,
      data: validated(parseAddMediaResponse, res.data),
    }))
  },

  taskCreateGrid(body: VideoPreviewTaskPayload) {
    return apiClient.post(API_ROUTES.taskCreateGrid, body)
  },

  taskCreateTimeline(body: VideoTimelineTaskPayload) {
    return apiClient.post(
      API_ROUTES.taskCreateGrid,
      buildVideoGridTaskParams(body.path ?? '', `${body.id}.jpg`),
    )
  },

  taskCreateThumbForVideo(body: VideoPreviewTaskPayload) {
    return apiClient.post(API_ROUTES.taskCreateThumbForVideo, body)
  },

  checkDataForMigrateFromLowDb() {
    return apiClient.post(API_ROUTES.taskCheckDataForMigrateFromLowDb)
  },

  cleanLowDb() {
    return apiClient.post(API_ROUTES.taskCleanLowDb)
  },

  createBackupLowDb(body: BackupNamePayload) {
    return apiClient.post<{ data?: string } | string>(API_ROUTES.taskCreateBackupLowDb, body)
  },

  restoreBackup(body: BackupNamePayload) {
    return apiClient.post(API_ROUTES.tasksBackupsRestoreBackup, body)
  },

  getBackups() {
    return apiClient.get(API_ROUTES.tasksBackupsGetBackups).then((res) => ({
      ...res,
      data: validated(parseBackupList, res.data),
    }))
  },

  createBackup() {
    return apiClient.get(API_ROUTES.tasksBackupsCreateBackup)
  },

  deleteBackup(body: BackupNamePayload) {
    return apiClient.post(API_ROUTES.tasksBackupsDeleteBackup, body)
  },

  importBackup(body: BackupNamePayload) {
    return apiClient.post(API_ROUTES.tasksBackupsImportBackup, body)
  },

  exportBackup(body: BackupNamePayload) {
    return apiClient.post(API_ROUTES.tasksBackupsExportBackup, body)
  },

  updateWatchedFolder(id: number, data: WatchedFolderUpdatePayload) {
    return apiClient.put(apiWatchedFolder(id), data)
  },

  createWatchedFolder(body: WatchedFolderCreatePayload) {
    return apiClient.post(API_ROUTES.watchedFolder, body)
  },

  deleteWatchedFolder(id: number) {
    return apiClient.delete(apiWatchedFolder(id))
  },

  getMediaTypesInWatchedFolders() {
    return apiClient.get(API_ROUTES.mediaTypesInWatchedFolders).then((res) => ({
      ...res,
      data: validated(parseWatchedFolderLinks, res.data),
    }))
  },

  applyBulkMeta(body: BulkMetaApplyPayload) {
    return apiClient.post(API_ROUTES.bulkMetaApply, body)
  },

  searchMediaByPath(body: SearchMediaByPathPayload) {
    return apiClient.post(API_ROUTES.taskSearchMediaByPath, body).then((res) => ({
      ...res,
      data: validated(parseMediaPathSearchResults, res.data),
    }))
  },

  updateMediaMultiple(body: UpdateMediaMultiplePayload) {
    return apiClient.post(API_ROUTES.taskUpdateMediaMultiple, body)
  },

  getDatabaseSizes(body: DatabaseSizesPayload) {
    const payload = validateRequest(DatabaseSizesRequestSchema, body)
    return apiClient.post(API_ROUTES.taskGetDatabaseSizes, payload).then((res) => ({
      ...res,
      data: validated(parseDatabaseSizesResponse, res.data),
    }))
  },

  deleteDb(body: BackupNamePayload) {
    return apiClient.post(API_ROUTES.taskDeleteDb, body)
  },

  clearGeneratedData(body: {imageType: string}) {
    return apiClient.post(API_ROUTES.taskClearData, body)
  },

  getFolderSize(body: FolderSizePayload) {
    const payload = validateRequest(FolderSizeRequestSchema, body)
    return apiClient.post(API_ROUTES.taskGetFolderSize, payload).then((res) => ({
      ...res,
      data: validated(parseFolderSizeResponse, res.data),
    }))
  },

  getClipModelStatus() {
    return apiClient.get(API_ROUTES.taskClipModelStatus).then((res) => ({
      ...res,
      data: validated(parseClipModelStatus, res.data),
    }))
  },

  downloadClipModel(body: BackupNamePayload = {}) {
    return apiClient.post(API_ROUTES.taskDownloadClipModel, body).then((res) => ({
      ...res,
      data: validated(parseClipModelStatus, res.data),
    }))
  },

  getFaceModelStatus() {
    return apiClient.get(API_ROUTES.taskFaceModelStatus).then((res) => ({
      ...res,
      data: validated(parseClipModelStatus, res.data),
    }))
  },

  downloadFaceModel(body: BackupNamePayload = {}) {
    return apiClient.post(API_ROUTES.taskDownloadFaceModel, body).then((res) => ({
      ...res,
      data: validated(parseClipModelStatus, res.data),
    }))
  },

  getFaceDetectionStatus() {
    return apiClient.get<{
      total?: number
      pending?: number
      generated?: number
      faces?: number
    }>(API_ROUTES.taskFaceDetectionStatus)
  },

  getFaceMatchStatus() {
    return apiClient.get<{
      performerTags?: number
      enrolledTags?: number
      enrolledFaces?: number
      faces?: number
      matchedFaces?: number
      embedModel?: {status?: string} | null
      settings?: {
        minConfidence?: number
        candidateLimit?: number
        mode?: string
        matchAfterDetect?: boolean | number | string
      } | null
    }>(API_ROUTES.taskFaceMatchStatus)
  },

  getFacesForMedia(mediaId: number, options: {ensureCrops?: boolean} = {}) {
    return apiClient.get<{faces?: Array<Record<string, unknown>>}>(API_ROUTES.taskFacesForMedia, {
      params: {
        mediaId,
        ...(options.ensureCrops === false ? {ensureCrops: false} : {}),
      },
    })
  },

  getFaceEmbedModelStatus() {
    return apiClient.get(API_ROUTES.taskFaceEmbedModelStatus).then((res) => ({
      ...res,
      data: validated(parseClipModelStatus, res.data),
    }))
  },

  downloadFaceEmbedModel(body: BackupNamePayload = {}) {
    return apiClient.post(API_ROUTES.taskDownloadFaceEmbedModel, body).then((res) => ({
      ...res,
      data: validated(parseClipModelStatus, res.data),
    }))
  },

  detectFacesForMedia(body: {
    mediaId: number
    force?: boolean
    framesPerVideo?: number
    minScore?: number
    match?: boolean
  }) {
    return apiClient.post(API_ROUTES.taskDetectFacesForMedia, body)
  },

  matchFacesForMedia(body: {mediaId: number; force?: boolean; applyTags?: boolean}) {
    return apiClient.post(API_ROUTES.taskMatchFacesForMedia, body)
  },

  assignFacePerformer(body: {
    faceId: number
    tagId: number
    enroll?: boolean
    applyTag?: boolean
    matchScore?: number | null
  }) {
    return apiClient.post<{mediaId?: number}>(API_ROUTES.taskAssignFacePerformer, body)
  },

  clearFacePerformer(body: {faceId: number}) {
    return apiClient.post<{mediaId?: number}>(API_ROUTES.taskClearFacePerformer, body)
  },

  getEnrollmentQualityForTag(tagId: number) {
    return apiClient.get(API_ROUTES.taskEnrollmentQualityForTag, {params: {tagId}})
  },

  enrollTagFaces(body: {tagId: number; force?: boolean}) {
    return apiClient.post(API_ROUTES.taskEnrollTagFaces, body)
  },

  getVideoImagesGenerationStatus() {
    return fetchApiJson<VideoImagesGenerationStatus>(API_ROUTES.taskVideoImagesGenerationStatus)
  },

  streamVideoImagesGeneration(
    options: {type: 'preview' | 'grid' | 'marks'; force?: boolean; signal?: AbortSignal},
    onEvent: (event: GenerationStreamEvent) => void,
  ) {
    return postApiNdjsonStream(
      API_ROUTES.taskStreamVideoImagesGeneration,
      {
        signal: options.signal,
        query: {type: options.type, force: options.force === true},
        errorMessage: 'Video images generation request failed',
      },
      onEvent,
    )
  },

  getImageThumbsGenerationStatus() {
    return fetchApiJson<ImageThumbsGenerationStatus>(API_ROUTES.taskImageThumbsGenerationStatus)
  },

  streamImageThumbsGeneration(
    options: {force?: boolean; signal?: AbortSignal},
    onEvent: (event: GenerationStreamEvent) => void,
  ) {
    return postApiNdjsonStream(
      API_ROUTES.taskStreamImageThumbsGeneration,
      {
        signal: options.signal,
        query: {force: options.force === true},
        errorMessage: 'Image thumbnails generation request failed',
      },
      onEvent,
    )
  },

  getTagImageAiUpscaleStatus() {
    return fetchApiJson<TagImageAiUpscaleStatus>(API_ROUTES.taskTagImageAiUpscaleStatus)
  },

  streamTagImageAiUpscale(
    options: {signal?: AbortSignal},
    onEvent: (event: GenerationStreamEvent) => void,
  ) {
    return postApiNdjsonStream(
      API_ROUTES.taskStreamTagImageAiUpscale,
      {
        signal: options.signal,
        ignoreMalformed: true,
        errorMessage: 'Tag image AI upscale request failed',
      },
      onEvent,
    )
  },

  createTab(body: TabCreatePayload) {
    return apiClient.post(API_ROUTES.tab, body).then((res) => ({
      ...res,
      data: validated(parseTab, res.data),
    }))
  },

  updateTab(id: number, data: TabUpdatePayload) {
    return apiClient.put(apiTab(id), data)
  },

  deleteTab(id: number) {
    return apiClient.delete(apiTab(id))
  },

  putApiPath(path: string, data: Record<string, unknown>) {
    return apiClient.put(path, data)
  },
}
