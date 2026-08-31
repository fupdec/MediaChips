import { apiClient } from '../apiClient'
import { streamModelDownload } from '../streamModelDownload'
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
  ConversionJobResponse,
  AddMediaPayload,
  AddMediaBulkPayload,
  BackupNamePayload,
  BulkMetaApplyPayload,
  ConfigUpdatePayload,
  CreateImagePayload,
  CreateMarkThumbPayload,
  CreateThumbPayload,
  DatabaseSizesPayload,
  DuplicateDbPayload,
  FolderSizePayload,
  GetFileBlobPayload,
  GetFileListPayload,
  SearchMediaByPathPayload,
  TabCreatePayload,
  TabUpdatePayload,
  UpdateMediaMultiplePayload,
  VideoPreviewTaskPayload,
  ConvertVideosPayload,
  TestVideoSegmentPayload,
  TestVideoSegmentResponse,
  TrimVideoPayload,
  TrimVideoJobResponse,
  TrimVideoDeleteOriginalPayload,
  TrimVideoDeleteOriginalResponse,
} from '@shared/api/payloads'
import {
  parseAddMediaResponse,
  parseBackupList,
  parseClipModelStatus,
  parseDatabaseSizesResponse,
  parseDuplicateDbResponse,
  parseFileExistsResponse,
  parseCheckFilesResponse,
  parseFileListResponse,
  parseFolderSizeResponse,
  parseImageThumbsGenerationStatus,
  parseMediaPathSearchResults,
  parseRelinkMissingMediaResponse,
  parseResolvePathResponse,
  parseTab,
  parseTagImageAiUpscaleStatus,
  parseVideoImagesGenerationStatus,
  parseWatchedFolderLinks,
} from '@shared/schemas'
import {
  AddMediaRequestSchema,
  AddMediaBulkRequestSchema,
  DatabaseSizesRequestSchema,
  DuplicateDbRequestSchema,
  CheckFilesPayloadSchema,
  FolderSizeRequestSchema,
} from '@shared/schemas/requests'
import { validated, validateRequest } from './validate'
import {ApiHttpError, postApiNdjsonStream} from '../ndjsonStream'

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
  /** 0–1 progress within the current item (e.g. long auto-chapter ffmpeg pass). */
  itemProgress?: number
  remaining?: number
  created?: number
  skipped?: number
  missing?: number
  failed?: number
  upscaled?: number
  scanned?: number
  matched?: number
  faces?: number
  enrolled?: number
  applied?: number
  mediaId?: number
  media?: number
  current?: string
  path?: string
  outputPath?: string
  phase?: string
  stage?: string
  message?: string
  /** 0–100 download / long-running progress when phase is downloading. */
  percent?: number
  stopped?: boolean
  downloadSizeMb?: number
  orphansDeleted?: number
  foldersRemoved?: number
  foldersCreated?: number
  imagesResized?: number
  match?: unknown
  matches?: unknown[]
  item?: unknown
  items?: unknown[]
  tag?: unknown
  summary?: Record<string, unknown>
  suggestions?: Array<{word?: string}>
  inLibrary?: unknown[]
  withinFolder?: unknown[]
  good?: number
  ok?: number
  weak?: number
  bad?: number
  none?: number
}

export {ApiHttpError}

export const tasksApi = {
  checkFileExists(path: string) {
    // Prefer lightweight builtin route so home cards do not cold-load Task/face.
    return apiClient.post(API_ROUTES.checkFile, { url: path }).then((res) => ({
      ...res,
      data: validated(parseFileExistsResponse, res.data),
    }))
  },

  checkFilesExist(paths: string[]) {
    const body = validateRequest(CheckFilesPayloadSchema, { paths })
    return apiClient.post(API_ROUTES.checkFiles, body).then((res) => ({
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

  ensureImageDimensions(id: number) {
    return apiClient.post<{width: number; height: number; orientation?: number}>(
      API_ROUTES.taskEnsureImageDimensions,
      {id},
    )
  },

  ensureMediaMetadataBulk(ids: number[]) {
    return apiClient.post<{
      items: Array<{
        id: number
        width: number
        height: number
        duration: number
        filesize: number
        codec?: string | null
        bitrate?: number | null
        fps?: number | null
        orientation?: number
      }>
    }>(API_ROUTES.taskEnsureMediaMetadataBulk, {ids})
  },

  openPath(body: { path: string; isDir?: boolean }) {
    return apiClient.post(API_ROUTES.taskOpenPath, body)
  },

  openInExternalPlayer(body: { path: string; player: 'mpv' | 'iina'; mediaId?: number }) {
    return apiClient.post(API_ROUTES.taskOpenInExternalPlayer, body)
  },

  convertVideos(body: ConvertVideosPayload) {
    return apiClient.post<{data: ConversionJobResponse}>(API_ROUTES.taskConvertVideos, body).then((res) => ({
      ...res,
      data: res.data.data,
    }))
  },

  createTestVideoSegment(body: TestVideoSegmentPayload) {
    return apiClient.post<{data: TestVideoSegmentResponse}>(API_ROUTES.taskCreateTestVideoSegment, body).then((res) => ({...res, data: res.data.data}))
  },

  trimVideo(body: TrimVideoPayload) {
    return apiClient.post<{data: TrimVideoJobResponse}>(API_ROUTES.taskTrimVideo, body).then((res) => ({
      ...res,
      data: res.data.data,
    }))
  },

  getTrimJob(jobId: string) {
    return apiClient.get<{data: TrimVideoJobResponse | null}>(`${API_ROUTES.taskTrim}/${encodeURIComponent(jobId)}`).then((res) => ({
      ...res,
      data: res.data.data,
    }))
  },

  cancelTrim(jobId: string) {
    return apiClient.post<{data: {cancelled: boolean}}>(`${API_ROUTES.taskTrim}/${encodeURIComponent(jobId)}/cancel`).then((res) => ({
      ...res,
      data: res.data.data,
    }))
  },

  trimDeleteOriginal(body: TrimVideoDeleteOriginalPayload) {
    return apiClient.post<{data: TrimVideoDeleteOriginalResponse}>(API_ROUTES.taskTrimVideoDeleteOriginal, body).then((res) => ({
      ...res,
      data: res.data.data,
    }))
  },

  getConversionJob(jobId: string) {
    return apiClient.get<{data: ConversionJobResponse | null}>(`${API_ROUTES.taskConversion}/${encodeURIComponent(jobId)}`).then((res) => ({
      ...res,
      data: res.data.data,
    }))
  },

  cancelConversion(jobId: string) {
    return apiClient.post<{data: {cancelled: boolean}}>(`${API_ROUTES.taskConversion}/${encodeURIComponent(jobId)}/cancel`).then((res) => ({
      ...res,
      data: res.data.data,
    }))
  },

  cancelAllConversions() {
    return apiClient.post<{data: {cancelled: number}}>(`${API_ROUTES.taskConversion}/cancel-all`).then((res) => ({
      ...res,
      data: res.data.data,
    }))
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

  addMedia(body: AddMediaPayload) {
    const payload = validateRequest(AddMediaRequestSchema, body)
    return apiClient.post(API_ROUTES.taskAddMedia, payload).then((res) => ({
      ...res,
      data: validated(parseAddMediaResponse, res.data),
    }))
  },

  addMediaBulk(body: AddMediaBulkPayload) {
    const payload = validateRequest(AddMediaBulkRequestSchema, body)
    return apiClient.post<{
      scanned: number
      inserted: number
      skipped: number
      errors: string[]
      added: Array<{path: string; mediaId: number}>
    }>(API_ROUTES.taskAddMediaBulk, payload, {timeout: 1_800_000}).then((res) => ({
      ...res,
      // sendOk writes the payload at the top level (not wrapped in `{data: ...}`).
      data: res.data,
    }))
  },

  taskCreateGrid(body: VideoPreviewTaskPayload) {
    // NAS / multi-seek grids can be slow; still fail closed so Review cannot hang forever.
    return apiClient.post(API_ROUTES.taskCreateGrid, body, {timeout: 100_000})
  },

  taskCreateTimeline(body: VideoTimelineTaskPayload) {
    return apiClient.post(API_ROUTES.taskCreateTimeline, {
      path: body.path,
      id: body.id,
    })
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

  assessWatchedFolder(body: {path: string; excludedPaths?: string[]}) {
    return apiClient.post(API_ROUTES.watchedFolderAssess, body)
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

  duplicateDb(body: DuplicateDbPayload) {
    const payload = validateRequest(DuplicateDbRequestSchema, body)
    return apiClient.post(API_ROUTES.taskDuplicateDb, payload).then((res) => ({
      ...res,
      data: validated(parseDuplicateDbResponse, res.data),
    }))
  },

  streamMergeLibrary(
    body: {sourceDatabaseId: string, copyGeneratedAssets?: boolean},
    options: {signal?: AbortSignal},
    onEvent: (event: GenerationStreamEvent) => void,
  ) {
    return postApiNdjsonStream(
      API_ROUTES.taskStreamMergeLibrary,
      {
        body,
        signal: options.signal,
        errorMessage: 'Library merge request failed',
      },
      onEvent,
    )
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

  downloadClipModel(
    body: BackupNamePayload = {},
    onProgress?: (progress: import('../streamModelDownload').ModelDownloadProgress) => void,
  ) {
    return streamModelDownload(API_ROUTES.taskDownloadClipModel, {
      body,
      onProgress,
      errorMessage: 'CLIP model download failed',
    }).then(async (result) => {
      const status = result.status ?? (await apiClient.get(API_ROUTES.taskClipModelStatus)).data
      return {data: validated(parseClipModelStatus, status)}
    })
  },

  getFaceModelStatus() {
    return apiClient.get(API_ROUTES.taskFaceModelStatus).then((res) => ({
      ...res,
      data: validated(parseClipModelStatus, res.data),
    }))
  },

  downloadFaceModel(
    body: BackupNamePayload = {},
    onProgress?: (progress: import('../streamModelDownload').ModelDownloadProgress) => void,
  ) {
    return streamModelDownload(API_ROUTES.taskDownloadFaceModel, {
      body,
      onProgress,
      errorMessage: 'Face model download failed',
    }).then(async (result) => {
      const status = result.status ?? (await apiClient.get(API_ROUTES.taskFaceModelStatus)).data
      return {data: validated(parseClipModelStatus, status)}
    })
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

  downloadFaceEmbedModel(
    body: BackupNamePayload = {},
    onProgress?: (progress: import('../streamModelDownload').ModelDownloadProgress) => void,
  ) {
    return streamModelDownload(API_ROUTES.taskDownloadFaceEmbedModel, {
      body,
      onProgress,
      errorMessage: 'Face embed model download failed',
    }).then(async (result) => {
      const status = result.status ?? (await apiClient.get(API_ROUTES.taskFaceEmbedModelStatus)).data
      return {data: validated(parseClipModelStatus, status)}
    })
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
    return apiClient.get(API_ROUTES.taskVideoImagesGenerationStatus).then((res) => ({
      ...res,
      data: validated(parseVideoImagesGenerationStatus, res.data) as VideoImagesGenerationStatus,
    }))
  },

  streamVideoImagesGeneration(
    options: {
      type: 'preview' | 'grid' | 'marks'
      force?: boolean
      signal?: AbortSignal
      mediaIds?: number[]
    },
    onEvent: (event: GenerationStreamEvent) => void,
  ) {
    return postApiNdjsonStream(
      API_ROUTES.taskStreamVideoImagesGeneration,
      {
        signal: options.signal,
        query: {type: options.type, force: options.force === true},
        body: {
          force: options.force === true,
          ...(options.mediaIds?.length ? {mediaIds: options.mediaIds} : {}),
        },
        errorMessage: 'Video images generation request failed',
      },
      onEvent,
    )
  },

  getVisualSearchQuickSample(limit?: number) {
    return apiClient.get<{ids: number[]; limit: number; count: number}>(
      API_ROUTES.taskVisualSearchQuickSample,
      {params: limit != null ? {limit} : undefined},
    )
  },

  getAutoChapterGenerationStatus() {
    return apiClient.get(API_ROUTES.taskAutoChapterGenerationStatus)
  },

  generateAutoChapters(body: {
    mediaId: number
    force?: boolean
    threshold?: number
    minGapSec?: number
    maxChapters?: number
    useSilence?: boolean
    useLlmTitles?: boolean
    locale?: string
  }) {
    return apiClient.post(API_ROUTES.taskGenerateAutoChapters, body)
  },

  streamAutoChapterGeneration(
    body: {
      force?: boolean
      mediaIds?: number[]
      threshold?: number
      minGapSec?: number
      maxChapters?: number
      useSilence?: boolean
      useLlmTitles?: boolean
      locale?: string
    },
    options: {signal?: AbortSignal},
    onEvent: (event: GenerationStreamEvent) => void,
  ) {
    return postApiNdjsonStream(
      API_ROUTES.taskStreamAutoChapterGeneration,
      {
        body,
        signal: options.signal,
        errorMessage: 'Auto chapter generation request failed',
      },
      onEvent,
    )
  },

  getImageThumbsGenerationStatus() {
    return apiClient.get(API_ROUTES.taskImageThumbsGenerationStatus).then((res) => ({
      ...res,
      data: validated(parseImageThumbsGenerationStatus, res.data) as ImageThumbsGenerationStatus,
    }))
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
    return apiClient.get(API_ROUTES.taskTagImageAiUpscaleStatus).then((res) => ({
      ...res,
      data: validated(parseTagImageAiUpscaleStatus, res.data) as TagImageAiUpscaleStatus,
    }))
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

  streamFaceDetection(
    body: Record<string, unknown>,
    options: {signal?: AbortSignal; errorMessage?: string},
    onEvent: (event: GenerationStreamEvent) => void,
  ) {
    return postApiNdjsonStream(
      API_ROUTES.taskStreamFaceDetection,
      {
        body,
        signal: options.signal,
        errorMessage: options.errorMessage || 'Face detection request failed',
      },
      onEvent,
    )
  },

  streamFaceEnrollment(
    body: Record<string, unknown>,
    options: {signal?: AbortSignal; errorMessage?: string},
    onEvent: (event: GenerationStreamEvent) => void,
  ) {
    return postApiNdjsonStream(
      API_ROUTES.taskStreamFaceEnrollment,
      {
        body,
        signal: options.signal,
        errorMessage: options.errorMessage || 'Face enrollment request failed',
      },
      onEvent,
    )
  },

  streamFaceMatching(
    body: Record<string, unknown>,
    options: {signal?: AbortSignal; errorMessage?: string},
    onEvent: (event: GenerationStreamEvent) => void,
  ) {
    return postApiNdjsonStream(
      API_ROUTES.taskStreamFaceMatching,
      {
        body,
        signal: options.signal,
        errorMessage: options.errorMessage || 'Face matching request failed',
      },
      onEvent,
    )
  },

  streamEnrollmentQualityReport(
    body: {metaId?: number | null},
    options: {
      signal?: AbortSignal
      beforeRead?: () => void | Promise<void>
      errorMessage?: string
    },
    onEvent: (event: GenerationStreamEvent) => void,
  ) {
    return postApiNdjsonStream(
      API_ROUTES.taskStreamEnrollmentQualityReport,
      {
        body,
        signal: options.signal,
        beforeRead: options.beforeRead,
        errorMessage: options.errorMessage || 'Enrollment quality request failed',
      },
      onEvent,
    )
  },

  streamFindMissingMedia(
    body: {folders: string[]},
    options: {signal?: AbortSignal},
    onEvent: (event: GenerationStreamEvent) => void,
  ) {
    return postApiNdjsonStream(
      API_ROUTES.taskStreamFindMissingMedia,
      {
        body,
        signal: options.signal,
        errorMessage: 'Missing media search request failed',
      },
      onEvent,
    )
  },

  relinkMissingMedia(body: {matches: unknown[]}) {
    return apiClient.post(API_ROUTES.taskRelinkMissingMedia, body).then((res) => ({
      ...res,
      data: validated(parseRelinkMissingMediaResponse, res.data),
    }))
  },

  streamParseLibraryTagsPreview(
    options: {signal?: AbortSignal; mediaIds?: number[]; settings?: Record<string, unknown>},
    onEvent: (event: GenerationStreamEvent) => void,
  ) {
    return postApiNdjsonStream(
      API_ROUTES.taskStreamParseLibraryTagsPreview,
      {
        signal: options.signal,
        body: {
          ...(options.mediaIds?.length ? {mediaIds: options.mediaIds} : {}),
          ...(options.settings ? {settings: options.settings} : {}),
        },
        errorMessage: 'Parse library tags request failed',
      },
      onEvent,
    )
  },

  streamScanFolderDuplicates(
    body: {
      folders: string[]
      excluded?: string[]
      mediaTypeId: number
    },
    options: {signal?: AbortSignal},
    onEvent: (event: GenerationStreamEvent) => void,
  ) {
    return postApiNdjsonStream(
      API_ROUTES.taskStreamScanFolderDuplicates,
      {
        body,
        signal: options.signal,
        errorMessage: 'Folder duplicate scan failed',
      },
      onEvent,
    )
  },

  exportMarkClips(
    body: {
      markIds: number[]
      outputPath?: string
      sort?: 'time' | 'shuffle' | 'selection'
      mode?: 'concat' | 'folder'
    },
    options: {signal?: AbortSignal},
    onEvent: (event: GenerationStreamEvent) => void,
  ) {
    return postApiNdjsonStream(
      API_ROUTES.taskExportMarkClips,
      {
        body,
        signal: options.signal,
        errorMessage: 'Mark clips export request failed',
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
