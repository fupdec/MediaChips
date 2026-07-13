export const API_ROUTES = {
  mediaType: '/api/mediaType',
  tag: '/api/tag',
  meta: '/api/meta',
  tab: '/api/tab',
  playlist: '/api/playlist',
  setting: '/api/Setting',
  mediaItems: '/api/media/items',
  pageSetting: '/api/PageSetting',
  savedFilter: '/api/SavedFilter',
  homeMedia: '/api/home/media',
  mark: '/api/mark',
  tagsInMediaCreateOne: '/api/TagsInMedia/createOne',
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
  mediaIds: '/api/media/ids',
  playlistSummary: '/api/Playlist/summary',
  mediaInPlaylists: '/api/mediaInPlaylists',
  mediaInPlaylistsUpdate: '/api/mediaInPlaylists/update',
  mediaUpdatePath: '/api/media/updatePath',
  mediaDeleteOne: '/api/media/deleteOne',
  resolvePath: '/api/resolve-path',
  getFile: '/api/get-file',
  updateConfig: '/api/update-config',
  switchDatabase: '/api/switch-database',
  taskCheckFileExists: '/api/Task/checkFileExists',
  taskCheckFilesExists: '/api/Task/checkFilesExists',
  taskCreateThumb: '/api/Task/createThumb',
  taskDeleteFile: '/api/Task/deleteFile',
  taskCreateImage: '/api/Task/createImage',
  taskCreateMarkThumb: '/api/Task/createMarkThumbForMark',
  taskUpdateMediaInfo: '/api/Task/updateMediaInfo',
  taskOpenPath: '/api/Task/openPath',
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
  mediaGetStats: '/api/media/get-stats',
  tagCount: '/api/tag/count',
  homeMarkers: '/api/home/markers',
  homeHealth: '/api/home/health',
  globalSearchMedia: '/api/home/search/media',
  globalSearchTags: '/api/home/search/tags',
  globalSearch: '/api/home/search',
  authStatus: '/api/auth/status',
  authLogin: '/api/auth/login',
  authLogout: '/api/auth/logout',
  mediaThumbs: '/api/media/thumbs',
  mediaThumbsCapital: '/api/Media/thumbs',
  tagThumbs: '/api/tag/thumbs',
  markItems: '/api/Mark/items',
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
  taskCreateGrid: '/api/Task/createGrid',
  taskCreateTimeline: '/api/Task/createTimeline',
  taskCreateThumbForVideo: '/api/Task/createThumbForVideo',
  taskCleanLowDb: '/api/Task/cleanLowDb',
  taskCheckDataForMigrateFromLowDb: '/api/Task/checkDataForMigrateFromLowDb',
  taskCreateBackupLowDb: '/api/Task/createBackupLowDb',
  taskMissingMediaStatus: '/api/Task/missingMediaStatus',
  taskClipModelStatus: '/api/Task/clipModelStatus',
  taskDownloadClipModel: '/api/Task/downloadClipModel',
  mediaNumberOfMediaWithTag: '/api/media/numberOfMediaWithTag',
  scraperSearchScenes: '/api/scraper/scenes/search',
  scraperMatchScenes: '/api/scraper/scenes/match',
  scraperScenesStatus: '/api/scraper/scenes/status',
} as const

export type ApiRouteKey = keyof typeof API_ROUTES

export function apiMeta(id: number | string) {
  return `/api/meta/${id}`
}

export function apiMetaSetting(id: number | string) {
  return `/api/MetaSetting/${id}`
}

export function apiMediaType(id: number | string) {
  return `/api/MediaType/${id}`
}

export function apiMark(id: number | string) {
  return `/api/mark/${id}`
}

export function apiVideoMetadata(id: number | string) {
  return `/api/videoMetadata/${id}`
}

export function apiEntity(model: string, id: number | string) {
  return `/api/${model}/${id}`
}

export function apiTagsInTag(tagId: number | string) {
  return `/api/TagsInTag?tagId=${tagId}`
}

export function apiValuesInTag(tagId: number | string) {
  return `/api/ValuesInTag?tagId=${tagId}`
}

export function apiTagsInMedia(mediaId: number | string) {
  return `/api/TagsInMedia?mediaId=${mediaId}`
}

export function apiValuesInMedia(mediaId: number | string) {
  return `/api/ValuesInMedia?mediaId=${mediaId}`
}

export function apiItemTagsEndpoint(endpoint: string) {
  return `/api/${endpoint}`
}

export function apiItemTagsEndpointDelete(endpoint: string, id: number | string) {
  return `/api/${endpoint}/${id}`
}

export function apiRemoveTagFromItem(type: string) {
  return `/api/TagsIn${type}/deleteFrom${type}`
}

export function apiMediaNumberOfMediaWithTag(mediaTypeId: number | string, tagId: number | string) {
  return `${API_ROUTES.mediaNumberOfMediaWithTag}?mediaTypeId=${mediaTypeId}&tagId=${tagId}`
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
  return `/api/playlist/${id}`
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
  return `/api/tab/${id}`
}

export function apiWatchedFolder(id: number | string) {
  return `/api/WatchedFolder/${id}`
}

export function apiMediaInPlaylists(id: number | string) {
  return `/api/mediaInPlaylists/${id}`
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
