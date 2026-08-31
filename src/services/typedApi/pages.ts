import { apiClient } from '../apiClient'
import {
  API_ROUTES,
  apiFilterRow,
  apiFilterRowsInSavedFilter,
  apiMediaInPlaylists,
  apiPlaylist,
  apiSavedFilter,
  apiSavedFilterMedia,
  apiSavedFilterSummary,
  apiTagsInFilterRow,
} from '@shared/api/routes'
import type {
  PageSettingData,
  PageSettingWritePayload,
  SavedFilterFindAllRequest,
} from '@shared/api/responses'
import type {
  CreateFilterRowPayload,
  CreatePlaylistPayload,
  CreateSavedFilterPayload,
  DeleteMediaInPlaylistsPayload,
  MediaInPlaylistOrderPayload,
  UpdatePlaylistPayload,
  UpdateSavedFilterPayload,
} from '@shared/api/payloads'
import {
  parseDynamicPlaylistSummaries,
  parseFilterRowResponse,
  parseFilterRowsInSavedFilter,
  parsePageSettingsFindOrCreate,
  parsePageSettingsRecordOrNull,
  parsePlaylistCreateResponse,
  parseSavedFilterBasicList,
  parsePlaylistMediaLinks,
  parseSavedFilterMediaResponse,
  parseSavedFilterFindOrCreateHydrated,
  parseSavedFilters,
  parseSavedFilterSummaryResponse,
  parseTagsInFilterRow,
} from '@shared/schemas'
import { validated } from './validate'

export const pagesApi = {
  getPageSetting(body: Record<string, unknown>) {
    return apiClient.post(API_ROUTES.pageSetting, body).then((res) => ({
      ...res,
      data: validated(parsePageSettingsFindOrCreate, res.data),
    }))
  },

  fetchPageSettings(query: PageSettingWritePayload['query']) {
    return apiClient.post(API_ROUTES.pageSetting, query).then((res) => ({
      ...res,
      data: validated(parsePageSettingsFindOrCreate, res.data),
    }))
  },

  /** Lookup only — never creates default page settings rows. */
  findPageSettings(query: PageSettingWritePayload['query']) {
    return apiClient.post(API_ROUTES.pageSettingFind, query).then((res) => ({
      ...res,
      data: validated(parsePageSettingsRecordOrNull, res.data),
    }))
  },

  postSavedFilterContext(body: SavedFilterFindAllRequest & { name: null }) {
    return apiClient.post(API_ROUTES.savedFilterFindOrCreateHydrated, body).then((res) => ({
      ...res,
      data: validated(parseSavedFilterFindOrCreateHydrated, res.data),
    }))
  },

  savePageSetting(body: PageSettingData & Record<string, unknown>) {
    return apiClient.post(API_ROUTES.pageSetting, body).then((res) => ({
      ...res,
      data: validated(parsePageSettingsFindOrCreate, res.data),
    }))
  },

  putPageSetting(body: PageSettingWritePayload) {
    return apiClient.put(API_ROUTES.pageSetting, body)
  },

  getSavedFilters() {
    return apiClient.get(API_ROUTES.savedFilter).then((res) => ({
      ...res,
      data: validated(parseSavedFilters, res.data),
    }))
  },

  findSavedFilters(body: SavedFilterFindAllRequest) {
    return apiClient.post(API_ROUTES.savedFilterFindAll, body).then((res) => ({
      ...res,
      data: validated(parseSavedFilters, res.data),
    }))
  },

  findSavedFiltersHydrated(body: SavedFilterFindAllRequest) {
    return apiClient.post(API_ROUTES.savedFilterFindAllHydrated, body).then((res) => ({
      ...res,
      data: validated(parseSavedFilters, res.data),
    }))
  },

  getDynamicPlaylistsBasic() {
    return apiClient.get(API_ROUTES.savedFilterDynamicBasic).then((res) => ({
      ...res,
      data: validated(parseSavedFilterBasicList, res.data),
    }))
  },

  getDynamicPlaylists() {
    return apiClient.get(API_ROUTES.savedFilterDynamic).then((res) => ({
      ...res,
      data: validated(parseDynamicPlaylistSummaries, res.data),
    }))
  },

  deleteSavedFilter(id: number, options: {permanent?: boolean} = {}) {
    return apiClient.delete(apiSavedFilter(id), {
      data: options.permanent ? {permanent: true} : undefined,
      params: options.permanent ? {permanent: '1'} : undefined,
    })
  },

  getSavedFilterMedia(id: number, params?: Record<string, unknown>) {
    return apiClient.get(apiSavedFilterMedia(id), { params }).then((res) => ({
      ...res,
      data: validated(parseSavedFilterMediaResponse, res.data),
    }))
  },

  getSavedFilterSummary(id: number) {
    return apiClient.get(apiSavedFilterSummary(id)).then((res) => ({
      ...res,
      data: validated(parseSavedFilterSummaryResponse, res.data),
    }))
  },

  getPlaylistSummary() {
    return apiClient.get(API_ROUTES.playlistSummary).then((res) => ({
      ...res,
      data: validated(parseDynamicPlaylistSummaries, res.data),
    }))
  },

  deleteFilterRow(id: number) {
    return apiClient.delete(apiFilterRow(id))
  },

  createFilterRow(body: CreateFilterRowPayload) {
    return apiClient.post(API_ROUTES.filterRow, body).then((res) => ({
      ...res,
      data: validated(parseFilterRowResponse, res.data),
    }))
  },

  createSavedFilter(body: CreateSavedFilterPayload) {
    return apiClient.post(API_ROUTES.savedFilter, body).then((res) => ({
      ...res,
      data: validated((data) => (
        Array.isArray(data) ? parseSavedFilters(data) : parseSavedFilters([data])[0]
      ), res.data),
    }))
  },

  updateSavedFilter(id: number, data: UpdateSavedFilterPayload) {
    return apiClient.put(apiSavedFilter(id), data)
  },

  updateFilterRow(id: number, data: Partial<CreateFilterRowPayload>) {
    return apiClient.put(apiFilterRow(id), data)
  },

  getFilterRowsInSavedFilter(filterId: number | string) {
    return apiClient.get(apiFilterRowsInSavedFilter(filterId)).then((res) => ({
      ...res,
      data: validated(parseFilterRowsInSavedFilter, res.data),
    }))
  },

  getTagsInFilterRow(rowId: number | string) {
    return apiClient.get(apiTagsInFilterRow(rowId)).then((res) => ({
      ...res,
      data: validated(parseTagsInFilterRow, res.data),
    }))
  },

  updatePlaylist(id: number, data: UpdatePlaylistPayload) {
    return apiClient.put(apiPlaylist(id), data)
  },

  deletePlaylist(id: number, options: {permanent?: boolean} = {}) {
    return apiClient.delete(apiPlaylist(id), {
      data: options.permanent ? {permanent: true} : undefined,
      params: options.permanent ? {permanent: '1'} : undefined,
    })
  },

  listPlaylistTrash(params?: {limit?: number}) {
    return apiClient.get<{
      items: Array<{
        kind: 'playlist'
        id: number
        name: string | null
        deletedAt: string
      }>
      count: number
      retentionDays: number
    }>(API_ROUTES.playlistTrashList, {params})
  },

  restorePlaylistTrash(body: {ids: number[]}) {
    return apiClient.post<{restoredIds: number[]}>(API_ROUTES.playlistTrashRestore, body)
  },

  purgePlaylistTrash(body: {ids: number[]}) {
    return apiClient.post<{deletedIds: number[]}>(API_ROUTES.playlistTrashPurge, body)
  },

  purgeExpiredPlaylistTrash() {
    return apiClient.post<{deletedIds: number[]}>(API_ROUTES.playlistTrashPurgeExpired, {})
  },

  listSavedFilterTrash(params?: {limit?: number}) {
    return apiClient.get<{
      items: Array<{
        kind: 'savedFilter'
        id: number
        name: string | null
        deletedAt: string
        metaId?: number | null
      }>
      count: number
      retentionDays: number
    }>(API_ROUTES.savedFilterTrashList, {params})
  },

  restoreSavedFilterTrash(body: {ids: number[]}) {
    return apiClient.post<{restoredIds: number[]}>(API_ROUTES.savedFilterTrashRestore, body)
  },

  purgeSavedFilterTrash(body: {ids: number[]}) {
    return apiClient.post<{deletedIds: number[]}>(API_ROUTES.savedFilterTrashPurge, body)
  },

  purgeExpiredSavedFilterTrash() {
    return apiClient.post<{deletedIds: number[]}>(API_ROUTES.savedFilterTrashPurgeExpired, {})
  },

  addMediaToPlaylist(body: { mediaId: number; playlistId: number }) {
    return apiClient.post(`${API_ROUTES.mediaInPlaylists}/`, body)
  },

  getMediaInPlaylist(id: number) {
    return apiClient.get(apiMediaInPlaylists(id)).then((res) => ({
      ...res,
      data: validated(parsePlaylistMediaLinks, res.data),
    }))
  },

  deleteMediaInPlaylists(body: DeleteMediaInPlaylistsPayload) {
    return apiClient.delete(`${API_ROUTES.mediaInPlaylists}/`, { data: body })
  },

  updateMediaInPlaylistsOrder(body: MediaInPlaylistOrderPayload[]) {
    return apiClient.post(API_ROUTES.mediaInPlaylistsUpdate, body)
  },

  createPlaylist(body: CreatePlaylistPayload) {
    return apiClient.post(`${API_ROUTES.playlist}/`, body).then((res) => ({
      ...res,
      data: validated(parsePlaylistCreateResponse, res.data),
    }))
  },
}
