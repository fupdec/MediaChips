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
} from '@shared/api/responses'
import type {
  MarkClipsRequestPayload,
  MarkItemsRequestPayload,
  MediaIdsRequestPayload,
  MediaPathUpdatePayload,
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

  deleteMark(id: number) {
    return apiClient.delete(apiMark(id))
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

  getMediaCountWithTag(mediaTypeId: number, tagId: number) {
    return apiClient.get(apiMediaNumberOfMediaWithTag(mediaTypeId, tagId)).then((res) => ({
      ...res,
      data: validated(parseMediaCountWithTag, res.data),
    }))
  },

  deleteEntityOne(type: string, body: DeleteEntityOnePayload) {
    return apiClient.post(`/api/${type}/deleteOne`, body)
  },
}
