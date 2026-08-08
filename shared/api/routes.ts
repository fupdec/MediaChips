import {normalizeApiPath} from './normalizeApiPath'

export const API_ROUTES = {
  mediaType: '/api/MediaType',
  tag: '/api/Tag',
  tagMerge: '/api/Tag/merge',
  tagMoveToCategory: '/api/Tag/moveToCategory',
  meta: '/api/Meta',
  metaMergeCategories: '/api/Meta/mergeCategories',
  metaExportChipRecipe: '/api/Meta/exportChipRecipe',
  metaPreviewChipRecipe: '/api/Meta/previewChipRecipe',
  metaImportChipRecipe: '/api/Meta/importChipRecipe',
  metaChipRecipeCatalog: '/api/Meta/chipRecipeCatalog',
  metaChipRecipeCatalogFile: '/api/Meta/chipRecipeCatalogFile',
  tab: '/api/Tab',
  playlist: '/api/Playlist',
  setting: '/api/Setting',
  mediaItems: '/api/Media/items',
  pageSetting: '/api/PageSetting',
  savedFilter: '/api/SavedFilter',
  homeMedia: '/api/home/media',
  mark: '/api/Mark',
  markByPath: '/api/Mark/by-path',
  tagsInMediaCreateOne: '/api/TagsInMedia/createOne',
  tagsInFolder: '/api/TagsInFolder',
  tagsInFolderCreateOne: '/api/TagsInFolder/createOne',
  tagsInFolderByPaths: '/api/TagsInFolder/byPaths',
  tagsInFolderList: '/api/TagsInFolder/list',
  tagsInFolderClearAll: '/api/TagsInFolder/clearAll',
  tagsInFolderReplaceForMeta: '/api/TagsInFolder/replaceForMeta',
  tagsInFolderRemapPaths: '/api/TagsInFolder/remapPaths',
  metaInMediaType: '/api/MetaInMediaType',
  pinnedMeta: '/api/PinnedMeta',
  savedFilterFindAll: '/api/SavedFilter/findAll',
  savedFilterFindAllHydrated: '/api/SavedFilter/findAllHydrated',
  savedFilterFindOrCreateHydrated: '/api/SavedFilter/findOrCreateHydrated',
  savedFilterDynamicBasic: '/api/SavedFilter/dynamicPlaylists/basic',
  savedFilterDynamic: '/api/SavedFilter/dynamicPlaylists',
  filterRowsInSavedFilter: '/api/FilterRowsInSavedFilter',
  tagsInFilterRow: '/api/TagsInFilterRow',
  filterRow: '/api/FilterRow',
  mediaBasics: '/api/Media/basics',
  mediaIds: '/api/Media/ids',
  mediaSimilarByVisual: '/api/Media/similarByVisual',
  mediaSuggestTagsFromSimilar: '/api/Media/suggestTagsFromSimilar',
  mediaSemanticSearch: '/api/Media/semanticSearch',
  mediaSimilarByClip: '/api/Media/similarByClip',
  mediaMerge: '/api/Media/merge',
  mediaDuplicateGroups: '/api/Media/duplicateGroups',
  playlistSummary: '/api/Playlist/summary',
  mediaInPlaylists: '/api/MediaInPlaylists',
  mediaInPlaylistsUpdate: '/api/MediaInPlaylists/update',
  mediaUpdatePath: '/api/Media/updatePath',
  mediaDeleteOne: '/api/Media/deleteOne',
  resolvePath: '/api/resolve-path',
  getFile: '/api/get-file',
  ping: '/api/ping',
  config: '/api/config',
  getMachineId: '/api/getMachineId',
  updateConfig: '/api/update-config',
  switchDatabase: '/api/switch-database',
  taskGetConfig: '/api/Task/getConfig',
  taskGetMachineId: '/api/Task/getMachineId',
  taskAddMedia: '/api/Task/addMedia',
  taskCheckFileExists: '/api/Task/checkFileExists',
  taskCheckFilesExists: '/api/Task/checkFilesExists',
  taskCreateThumb: '/api/Task/createThumb',
  taskDeleteFile: '/api/Task/deleteFile',
  taskCreateImage: '/api/Task/createImage',
  taskCreateMarkThumb: '/api/Task/createMarkThumbForMark',
  taskUpdateMediaInfo: '/api/Task/updateMediaInfo',
  taskEnsureImageDimensions: '/api/Task/ensureImageDimensions',
  taskOpenPath: '/api/Task/openPath',
  taskOpenInExternalPlayer: '/api/Task/openInExternalPlayer',
  tagsInMedia: '/api/TagsInMedia',
  valuesInMedia: '/api/ValuesInMedia',
  watchedFolder: '/api/WatchedFolder',
  mediaTypesInWatchedFolders: '/api/MediaTypesInWatchedFolders',
  tasksBackupsGetBackups: '/api/TasksBackups/getBackups',
  tasksBackupsCreateBackup: '/api/TasksBackups/createBackup',
  tasksBackupsDeleteBackup: '/api/TasksBackups/deleteBackup',
  tasksBackupsRestoreBackup: '/api/TasksBackups/restoreBackup',
  tasksBackupsImportBackup: '/api/TasksBackups/importBackup',
  tasksBackupsExportBackup: '/api/TasksBackups/exportBackup',
  homeExtendedStats: '/api/home/extended-stats',
  mediaGetStats: '/api/Media/get-stats',
  tagCount: '/api/Tag/count',
  homeMarkers: '/api/home/markers',
  homeHealth: '/api/home/health',
  homeHealthLite: '/api/home/health-lite',
  globalSearchMedia: '/api/home/search/media',
  globalSearchTags: '/api/home/search/tags',
  globalSearch: '/api/home/search',
  authStatus: '/api/auth/status',
  authLogin: '/api/auth/login',
  authLogout: '/api/auth/logout',
  mediaThumbs: '/api/Media/thumbs',
  tagThumbs: '/api/Tag/thumbs',
  markItems: '/api/Mark/items',
  markClips: '/api/Mark/clips',
  markFilterMetas: '/api/Mark/filter-metas',
  bulkMetaApply: '/api/bulk-meta/apply',
  transcodeCache: '/api/transcode/cache',
  taskSearchMediaByPath: '/api/Task/searchMediaByPath',
  taskUpdateMediaMultiple: '/api/Task/updateMediaMultiple',
  taskGetDatabaseSizes: '/api/Task/getDatabaseSizes',
  taskDeleteDb: '/api/Task/deleteDb',
  taskClearData: '/api/Task/clearData',
  taskGetFolderSize: '/api/Task/getFolderSize',
  taskParsePathTags: '/api/Task/parsePathTags',
  taskParseLibraryTagsStatus: '/api/Task/parseLibraryTagsStatus',
  taskStreamParseLibraryTagsPreview: '/api/Task/streamParseLibraryTagsPreview',
  taskApplyParseLibraryTags: '/api/Task/applyParseLibraryTags',
  taskSuggestTagsFromPaths: '/api/Task/suggestTagsFromPaths',
  taskGetFileList: '/api/Task/getFileList',
  mediaRoots: '/api/media-roots',
  browseListDirectory: '/api/browse/listDirectory',
  browsePlaces: '/api/browse/places',
  taskCreateGrid: '/api/Task/createGrid',
  taskCreateTimeline: '/api/Task/createTimeline',
  taskCreateThumbForVideo: '/api/Task/createThumbForVideo',
  taskCleanLowDb: '/api/Task/cleanLowDb',
  taskCheckDataForMigrateFromLowDb: '/api/Task/checkDataForMigrateFromLowDb',
  taskCreateBackupLowDb: '/api/Task/createBackupLowDb',
  stashStreamImport: '/api/stash/streamImport',
  jellyfinListLibraries: '/api/jellyfin/listLibraries',
  jellyfinStreamImport: '/api/jellyfin/streamImport',
  plexListLibraries: '/api/plex/listLibraries',
  plexStreamImport: '/api/plex/streamImport',
  embyListLibraries: '/api/emby/listLibraries',
  embyStreamImport: '/api/emby/streamImport',
  taskMissingMediaStatus: '/api/Task/missingMediaStatus',
  taskStreamFindMissingMedia: '/api/Task/streamFindMissingMedia',
  taskRelinkMissingMedia: '/api/Task/relinkMissingMedia',
  taskStreamScanFolderDuplicates: '/api/Task/streamScanFolderDuplicates',
  taskStreamVideoObjectRecognition: '/api/Task/streamVideoObjectRecognition',
  taskSuggestTagsFromVideoFrames: '/api/Task/suggestTagsFromVideoFrames',
  taskContentHashBackfillStatus: '/api/Task/contentHashBackfillStatus',
  taskStreamContentHashBackfill: '/api/Task/streamContentHashBackfill',
  taskOshashBackfillStatus: '/api/Task/oshashBackfillStatus',
  taskStreamOshashBackfill: '/api/Task/streamOshashBackfill',
  taskFingerprintBackfillStatus: '/api/Task/fingerprintBackfillStatus',
  taskStreamFingerprintBackfill: '/api/Task/streamFingerprintBackfill',
  taskVisualHashBackfillStatus: '/api/Task/visualHashBackfillStatus',
  taskStreamVisualHashBackfill: '/api/Task/streamVisualHashBackfill',
  taskClipEmbeddingBackfillStatus: '/api/Task/clipEmbeddingBackfillStatus',
  taskStreamClipEmbeddingBackfill: '/api/Task/streamClipEmbeddingBackfill',
  taskExportMarkClips: '/api/Task/exportMarkClips',
  taskVideoCodecBackfillStatus: '/api/Task/videoCodecBackfillStatus',
  taskStreamVideoCodecBackfill: '/api/Task/streamVideoCodecBackfill',
  taskVideoImagesGenerationStatus: '/api/Task/videoImagesGenerationStatus',
  taskStreamVideoImagesGeneration: '/api/Task/streamVideoImagesGeneration',
  taskAutoChapterGenerationStatus: '/api/Task/autoChapterGenerationStatus',
  taskGenerateAutoChapters: '/api/Task/generateAutoChapters',
  taskStreamAutoChapterGeneration: '/api/Task/streamAutoChapterGeneration',
  taskImageThumbsGenerationStatus: '/api/Task/imageThumbsGenerationStatus',
  taskStreamImageThumbsGeneration: '/api/Task/streamImageThumbsGeneration',
  taskTagImageAiUpscaleStatus: '/api/Task/tagImageAiUpscaleStatus',
  taskStreamTagImageAiUpscale: '/api/Task/streamTagImageAiUpscale',
  taskLocalAiStatus: '/api/Task/localAiStatus',
  taskSetLocalAiEnabled: '/api/Task/setLocalAiEnabled',
  taskStreamDownloadLocalAi: '/api/Task/downloadLocalAi',
  taskDeleteLocalAi: '/api/Task/deleteLocalAi',
  taskStreamLocalAiChat: '/api/Task/localAiChat',
  taskLocalAiTools: '/api/Task/localAiTools',
  taskClipModelStatus: '/api/Task/clipModelStatus',
  taskDownloadClipModel: '/api/Task/downloadClipModel',
  taskFaceModelStatus: '/api/Task/faceModelStatus',
  taskDownloadFaceModel: '/api/Task/downloadFaceModel',
  taskFaceEmbedModelStatus: '/api/Task/faceEmbedModelStatus',
  taskDownloadFaceEmbedModel: '/api/Task/downloadFaceEmbedModel',
  taskFaceDetectionStatus: '/api/Task/faceDetectionStatus',
  taskFaceMatchStatus: '/api/Task/faceMatchStatus',
  taskFacesForMedia: '/api/Task/facesForMedia',
  taskDetectFacesForMedia: '/api/Task/detectFacesForMedia',
  taskMatchFacesForMedia: '/api/Task/matchFacesForMedia',
  taskAssignFacePerformer: '/api/Task/assignFacePerformer',
  taskClearFacePerformer: '/api/Task/clearFacePerformer',
  taskEnrollmentQualityForTag: '/api/Task/enrollmentQualityForTag',
  taskEnrollTagFaces: '/api/Task/enrollTagFaces',
  taskStreamEnrollmentQualityReport: '/api/Task/streamEnrollmentQualityReport',
  taskStreamFaceDetection: '/api/Task/streamFaceDetection',
  taskStreamFaceEnrollment: '/api/Task/streamFaceEnrollment',
  taskStreamFaceMatching: '/api/Task/streamFaceMatching',
  mediaNumberOfMediaWithTag: '/api/Media/numberOfMediaWithTag',
  scraperSearchPerformers: '/api/scraper/performers',
  scraperSearchScenes: '/api/scraper/scenes/search',
  scraperMatchScenes: '/api/scraper/scenes/match',
  scraperScenesStatus: '/api/scraper/scenes/status',
  scraperSceneMarkers: '/api/scraper/scenes/markers',
  scraperSceneMarkersApply: '/api/scraper/scenes/markers/apply',
  scraperCamGirlFinderSearch: '/api/scraper/camgirlfinder/search',
  tmdbStatus: '/api/tmdb/status',
  tmdbSearch: '/api/tmdb/search',
  tmdbMovie: '/api/tmdb/movie',
  tmdbTitle: '/api/tmdb/title',
  tmdbFindImdb: '/api/tmdb/find/imdb',
  tmdbPersonSearch: '/api/tmdb/person/search',
  tmdbPerson: '/api/tmdb/person',
  plugin: '/api/Plugin',
  pluginInstall: '/api/Plugin/install',
  pluginUninstall: '/api/Plugin/uninstall',
} as const

export type ApiRouteKey = keyof typeof API_ROUTES

export function apiMeta(id: number | string) {
  return `/api/Meta/${id}`
}

export function apiChipRecipeCatalogFile(relativePath: string) {
  return `${API_ROUTES.metaChipRecipeCatalogFile}?path=${encodeURIComponent(relativePath)}`
}

export function apiMetaSetting(id: number | string) {
  return `/api/MetaSetting/${id}`
}

export function apiMediaType(id: number | string) {
  return `/api/MediaType/${id}`
}

export function apiMark(id: number | string) {
  return `/api/Mark/${id}`
}

export function apiVideoMetadata(id: number | string) {
  return `/api/VideoMetadata/${id}`
}

export function apiEntity(model: string, id: number | string) {
  return normalizeApiPath(`/api/${model}/${id}`)
}

export function apiTagsInTag(tagId: number | string) {
  return `/api/TagsInTag?tagId=${tagId}`
}

export function apiTagCooccurring(tagId: number | string, mediaTypeId?: number | string | null) {
  const base = `/api/Tag/${tagId}/cooccurring`
  if (mediaTypeId == null || mediaTypeId === '') return base
  return `${base}?mediaTypeId=${mediaTypeId}`
}

export function apiValuesInTag(tagId: number | string) {
  return `/api/ValuesInTag?tagId=${tagId}`
}

export function apiTagsInMedia(mediaId: number | string) {
  return `/api/TagsInMedia?mediaId=${mediaId}`
}

export function apiTagsInFolder(folderPath: string) {
  return `/api/TagsInFolder?path=${encodeURIComponent(folderPath)}`
}

export function apiValuesInMedia(mediaId: number | string) {
  return `/api/ValuesInMedia?mediaId=${mediaId}`
}

export function apiItemTagsEndpoint(endpoint: string) {
  return normalizeApiPath(`/api/${endpoint}`)
}

export function apiItemTagsEndpointDelete(endpoint: string, id: number | string) {
  return normalizeApiPath(`/api/${endpoint}/${id}`)
}

export function apiRemoveTagFromItem(type: string) {
  return `/api/TagsIn${type}/deleteFrom${type}`
}

export function apiMediaNumberOfMediaWithTag(tagId: number | string) {
  return `${API_ROUTES.mediaNumberOfMediaWithTag}?tagId=${tagId}`
}

export function apiMetaInMediaTypeByMeta(metaId: number | string) {
  return `/api/MetaInMediaType?metaId=${metaId}`
}

export function apiMetaInMediaTypeByMediaType(mediaTypeId: number | string) {
  return `/api/MetaInMediaType?mediaTypeId=${mediaTypeId}`
}

export function apiPinnedMetaByMeta(metaId: number | string) {
  return `/api/PinnedMeta?metaId=${metaId}`
}

export function apiPinnedMetaByPinned(pinnedMetaId: number | string) {
  return `/api/PinnedMeta?pinnedMetaId=${pinnedMetaId}`
}

export function apiFilterRowsInSavedFilter(filterId: number | string) {
  return `${API_ROUTES.filterRowsInSavedFilter}?filterId=${filterId}`
}

export function apiTagsInFilterRow(rowId: number | string) {
  return `${API_ROUTES.tagsInFilterRow}?rowId=${rowId}`
}

export function apiMetaInMediaTypeDelete(mediaTypeId: number, metaId: number) {
  return `${API_ROUTES.metaInMediaType}?mediaTypeId=${mediaTypeId}&metaId=${metaId}`
}

export function apiPinnedMetaDelete(pinnedMetaId: number, metaId: number) {
  return `${API_ROUTES.pinnedMeta}/${pinnedMetaId}?metaId=${metaId}`
}

export function apiSetting(option: string) {
  return `${API_ROUTES.setting}/${option}`
}

export function apiPlaylist(id: number | string) {
  return `/api/Playlist/${id}`
}

export function apiSavedFilter(id: number | string) {
  return `/api/SavedFilter/${id}`
}

export function apiSavedFilterMedia(id: number | string) {
  return `/api/SavedFilter/${id}/media`
}

export function apiSavedFilterSummary(id: number | string) {
  return `/api/SavedFilter/${id}/summary`
}

export function apiFilterRow(id: number | string) {
  return `${API_ROUTES.filterRow}/${id}`
}

export function apiMarksForVideo(id: number | string) {
  return `/api/Mark/video/${id}`
}

export function apiTab(id: number | string) {
  return `/api/Tab/${id}`
}

export function apiWatchedFolder(id: number | string) {
  return `/api/WatchedFolder/${id}`
}

export function apiMediaInPlaylists(id: number | string) {
  return `/api/MediaInPlaylists/${id}`
}

export function apiVideoPlayable(id: number | string) {
  return `/api/video/${id}/playable`
}

export function apiVideoStream(id: number | string) {
  return `/api/video/${id}`
}

export function apiVideoTranscodeStream(id: number | string) {
  return `/api/video/${id}/transcode/stream`
}

export function apiTmdbMovie(id: number | string) {
  return `${API_ROUTES.tmdbMovie}/${id}`
}

export function apiTmdbTitle(mediaType: string, id: number | string) {
  return `${API_ROUTES.tmdbTitle}/${mediaType}/${id}`
}

export function apiTmdbFindImdb(imdbId: string) {
  return `${API_ROUTES.tmdbFindImdb}/${encodeURIComponent(imdbId)}`
}

export function apiTmdbPerson(id: number | string) {
  return `${API_ROUTES.tmdbPerson}/${id}`
}

export function apiPluginList(enabledPlugins: string[]) {
  const params = new URLSearchParams({
    enabledPlugins: JSON.stringify(enabledPlugins),
  })
  return `${API_ROUTES.plugin}?${params.toString()}`
}
