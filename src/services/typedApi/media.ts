import type { AxiosRequestConfig } from 'axios'
import { apiClient } from '../apiClient'
import {
  API_ROUTES,
  apiEntity,
  apiMark,
  apiMarksForVideo,
  apiMediaNumberOfMediaWithTag,
  apiVideoMetadata,
} from '@shared/api/routes'
import type {
  ItemsListRequest,
  MediaListResponseData,
  DeleteEntityOnePayload,
  EntityUpdatePayload,
  MarkForVideo,
  MediaDuplicateGroupsResult,
  MergeMediaResult,
} from '@shared/api/responses'
import type {
  MarkClipsRequestPayload,
  MarkItemsRequestPayload,
  MediaDuplicateGroupsPayload,
  MediaIdsRequestPayload,
  MediaPathUpdatePayload,
  MergeMediaPayload,
  VideoMetadataUpdatePayload,
} from '@shared/api/payloads'
import {
  parseMark,
  parseMarkClipsResponse,
  parseMarksForVideo,
  parseMediaCountWithTag,
  parseMediaIdsResponse,
  parseMediaListResponse,
  parseVideoMetadata,
} from '@shared/schemas'
import { validated } from './validate'

export const mediaApi = {
  getMediaItems(body: ItemsListRequest) {
    return apiClient.post<MediaListResponseData>(API_ROUTES.mediaItems, body).then((res) => ({
      ...res,
      data: validated(parseMediaListResponse, res.data),
    }))
  },

  postItemsList(url: string, body: ItemsListRequest, config?: AxiosRequestConfig) {
    return apiClient.post<MediaListResponseData>(url, body, config).then((res) => ({
      ...res,
      data: validated(parseMediaListResponse, res.data),
    }))
  },

  updateEntity(model: string, id: number, data: EntityUpdatePayload) {
    return apiClient.put(apiEntity(model, id), data)
  },

  createMark(mark: MarkForVideo) {
    return apiClient.post(API_ROUTES.mark, mark).then((res) => ({
      ...res,
      data: validated(parseMark, res.data),
    }))
  },

  updateMark(id: number, mark: Partial<MarkForVideo>) {
    return apiClient.put(apiMark(id), mark).then((res) => ({
      ...res,
      data: validated(parseMark, res.data),
    }))
  },

  deleteMark(id: number) {
    return apiClient.delete(apiMark(id))
  },

  listMarkTrash(params?: {limit?: number}) {
    return apiClient.get<{
      items: Array<{
        kind: 'mark'
        id: number
        name: string | null
        deletedAt: string
        metaId?: number | null
        mediaId?: number | null
      }>
      count: number
      retentionDays: number
    }>(API_ROUTES.markTrashList, {params})
  },

  restoreMarkTrash(body: {ids: number[]}) {
    return apiClient.post<{restoredIds: number[]}>(API_ROUTES.markTrashRestore, body)
  },

  purgeMarkTrash(body: {ids: number[]}) {
    return apiClient.post<{deletedIds: number[]}>(API_ROUTES.markTrashPurge, body)
  },

  purgeExpiredMarkTrash() {
    return apiClient.post<{deletedIds: number[]}>(API_ROUTES.markTrashPurgeExpired, {})
  },

  updateVideoMetadata(id: number, data: VideoMetadataUpdatePayload) {
    return apiClient.put(apiVideoMetadata(id), data)
  },

  updateMediaPath(body: MediaPathUpdatePayload) {
    return apiClient.post(API_ROUTES.mediaUpdatePath, body)
  },

  deleteMediaOne(body: DeleteEntityOnePayload) {
    return apiClient.post(API_ROUTES.mediaDeleteOne, body)
  },

  listMediaTrash(params?: {limit?: number}) {
    return apiClient.get<{
      items: Array<{
        id: number
        name: string | null
        basename: string | null
        path: string | null
        originalPath: string | null
        mediaTypeId: number | null
        deletedAt: string
        purgeFile: boolean
        filesize: number | null
      }>
      count: number
      retentionDays: number
    }>(API_ROUTES.mediaTrashList, {params})
  },

  restoreMediaTrash(body: {ids: number[]}) {
    return apiClient.post<{restoredIds: number[]}>(API_ROUTES.mediaTrashRestore, body)
  },

  purgeMediaTrash(body: {ids: number[]}) {
    return apiClient.post<{deletedIds: number[]}>(API_ROUTES.mediaTrashPurge, body)
  },

  purgeExpiredMediaTrash() {
    return apiClient.post<{deletedIds: number[]}>(API_ROUTES.mediaTrashPurgeExpired, {})
  },

  getMediaBasics(body: { ids: number[] }) {
    return apiClient.post<MediaListResponseData>(API_ROUTES.mediaBasics, body).then((res) => ({
      ...res,
      data: validated(parseMediaListResponse, res.data),
    }))
  },

  getMediaIds(body: MediaIdsRequestPayload) {
    return apiClient.post(API_ROUTES.mediaIds, body).then((res) => ({
      ...res,
      data: validated(parseMediaIdsResponse, res.data),
    }))
  },

  similarByVisual(body: {seedId: number, limit?: number}) {
    return apiClient.post<{
      seedId: number
      hasVisualHash: boolean
      ids: number[]
    }>(API_ROUTES.mediaSimilarByVisual, body)
  },

  suggestTagsFromSimilar(body: {
    seedId?: number
    mediaIds?: number[]
    neighborLimit?: number
    tagLimit?: number
    minCount?: number
    apply?: boolean
  }) {
    return apiClient.post<{
      mediaId?: number
      hasVisualHash?: boolean
      neighborCount?: number
      suggestions?: Array<{tagId: number; metaId: number; name: string; count: number}>
      applied?: number
      items?: Array<{
        mediaId: number
        hasVisualHash: boolean
        neighborCount: number
        suggestions: Array<{tagId: number; metaId: number; name: string; count: number}>
        applied: number
      }>
      suggested?: number
    }>(API_ROUTES.mediaSuggestTagsFromSimilar, body)
  },

  semanticSearch(body: {query: string, mediaTypeId?: number | null, limit?: number, locale?: string | null}) {
    return apiClient.post<{
      ids: number[]
      hits?: Array<{id: number; tileIndex: number | null; time: number | null}>
      seekableCount?: number
      missingEmbeddingsCount: number
      indexedCount?: number
      previewCandidatesCount?: number
      modelStatus?: string
      originalQuery?: string
      searchQuery?: string
      translated?: boolean
      sourceLang?: string | null
      error?: string
    }>(API_ROUTES.mediaSemanticSearch, body)
  },

  similarByClip(body: {seedId: number, limit?: number}) {
    return apiClient.post<{
      seedId: number
      hasEmbedding: boolean
      seedTileCount: number
      ids: number[]
    }>(API_ROUTES.mediaSimilarByClip, body)
  },

  /** CLIP + tags hybrid (Home Similar ranking) for a fixed seed. */
  similarHybrid(body: {seedId: number, limit?: number}) {
    return apiClient.post<{
      seedId: number
      hasSignals: boolean
      hasEmbedding: boolean
      hasTags: boolean
      ids: number[]
      hits?: Array<{
        id: number
        score: number
        signals?: Partial<Record<'clip' | 'tags', number>>
      }>
    }>(API_ROUTES.mediaSimilarHybrid, body)
  },

  mergeMedia(body: MergeMediaPayload) {
    return apiClient.post<MergeMediaResult>(API_ROUTES.mediaMerge, body)
  },

  getMediaDuplicateGroups(body: MediaDuplicateGroupsPayload) {
    return apiClient.post<MediaDuplicateGroupsResult>(API_ROUTES.mediaDuplicateGroups, body)
  },

  getMarksForVideo(id: number) {
    return apiClient.get(apiMarksForVideo(id)).then((res) => ({
      ...res,
      data: validated(parseMarksForVideo, res.data),
    }))
  },

  getVideoMetadata(id: number) {
    return apiClient.get(apiVideoMetadata(id)).then((res) => ({
      ...res,
      data: validated(parseVideoMetadata, res.data),
    }))
  },

  postMarkItems(body: MarkItemsRequestPayload) {
    return apiClient.post<MediaListResponseData>(API_ROUTES.markItems, body).then((res) => ({
      ...res,
      data: validated(parseMediaListResponse, res.data),
    }))
  },

  getMarkClips(body: MarkClipsRequestPayload) {
    return apiClient.post(API_ROUTES.markClips, body).then((res) => ({
      ...res,
      data: validated(parseMarkClipsResponse, res.data),
    }))
  },

  getMediaCountWithTag(tagId: number) {
    return apiClient.get(apiMediaNumberOfMediaWithTag(tagId)).then((res) => ({
      ...res,
      data: validated(parseMediaCountWithTag, res.data),
    }))
  },

  deleteEntityOne(type: string, body: DeleteEntityOnePayload) {
    return apiClient.post(`/api/${type}/deleteOne`, body)
  },
}
