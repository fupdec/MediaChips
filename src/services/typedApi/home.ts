import { apiClient } from '../apiClient'
import { API_ROUTES } from '@shared/api/routes'
import type { HomeMediaResponse } from '@shared/api/responses'
import type { AxiosRequestConfig } from 'axios'
import {
  parseExtendedStats,
  parseGlobalSearchMediaResponse,
  parseGlobalSearchTagsResponse,
  parseGlobalSearchResponse,
  parseHomeHealth,
  parseHomeMarkers,
  parseHomeMediaResponse,
  parseHomeMediaStats,
  parseHomeTagCount,
  parseMediaThumbsResponse,
  parseMissingMediaStatus,
  parseSuggestTagsResponse,
} from '@shared/schemas'
import { validated } from './validate'

export const homeApi = {
  getHomeMedia(params?: Record<string, unknown>) {
    return apiClient.get<HomeMediaResponse>(API_ROUTES.homeMedia, { params }).then((res) => ({
      ...res,
      data: validated(parseHomeMediaResponse, res.data),
    }))
  },

  getHomeExtendedStats() {
    return apiClient.get(API_ROUTES.homeExtendedStats).then((res) => ({
      ...res,
      data: validated(parseExtendedStats, res.data),
    }))
  },

  getMediaStats() {
    return apiClient.get(API_ROUTES.mediaGetStats).then((res) => ({
      ...res,
      data: validated(parseHomeMediaStats, res.data),
    }))
  },

  getTagCount() {
    return apiClient.get(API_ROUTES.tagCount).then((res) => ({
      ...res,
      data: validated(parseHomeTagCount, res.data),
    }))
  },

  getHomeMarkers(params?: Record<string, unknown>) {
    return apiClient.get(API_ROUTES.homeMarkers, { params }).then((res) => ({
      ...res,
      data: validated(parseHomeMarkers, res.data),
    }))
  },

  getHomeHealth() {
    return apiClient.get(API_ROUTES.homeHealth).then((res) => ({
      ...res,
      data: validated(parseHomeHealth, res.data),
    }))
  },

  getMissingMediaStatus({full = false}: {full?: boolean} = {}) {
    return apiClient.get(API_ROUTES.taskMissingMediaStatus, {
      params: full ? {full: 'true'} : undefined,
    }).then((res) => ({
      ...res,
      data: validated(parseMissingMediaStatus, res.data),
    }))
  },

  searchGlobal(body: { q: string; limit?: number }, config?: AxiosRequestConfig) {
    return apiClient.post(API_ROUTES.globalSearch, body, config).then((res) => ({
      ...res,
      data: validated(parseGlobalSearchResponse, res.data),
    }))
  },

  searchMedia(body: { q: string; limit?: number }, config?: AxiosRequestConfig) {
    return apiClient.post(API_ROUTES.globalSearchMedia, body, config).then((res) => ({
      ...res,
      data: validated(parseGlobalSearchMediaResponse, res.data),
    }))
  },

  searchTags(body: { q: string; limit?: number }, config?: AxiosRequestConfig) {
    return apiClient.post(API_ROUTES.globalSearchTags, body, config).then((res) => ({
      ...res,
      data: validated(parseGlobalSearchTagsResponse, res.data),
    }))
  },

  postMediaThumbs(body: Record<string, unknown>, capitalized = false) {
    const route = capitalized ? API_ROUTES.mediaThumbsCapital : API_ROUTES.mediaThumbs
    return apiClient.post(route, body).then((res) => ({
      ...res,
      data: validated(parseMediaThumbsResponse, res.data),
    }))
  },

  suggestTagsFromPaths(body: Record<string, unknown>) {
    return apiClient.post(API_ROUTES.taskSuggestTagsFromPaths, body).then((res) => ({
      ...res,
      data: validated(parseSuggestTagsResponse, res.data),
    }))
  },
}
