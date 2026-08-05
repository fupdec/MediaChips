import {apiClient} from '../apiClient'
import {API_ROUTES} from '@shared/api/routes'
import {
  parseCamGirlFinderSearchResponse,
  parseSceneScraperMarkersApplyResult,
  parseSceneScraperMarkersResponse,
  parseSceneScraperSearchResponse,
  parseScraperPerformerSearchResponse,
} from '@shared/schemas'
import {validated} from './validate'

export const scrapersApi = {
  searchScraperPerformers(params: {gender?: string; page?: number; q?: string} = {}) {
    return apiClient.get(API_ROUTES.scraperSearchPerformers, {params}).then((res) => ({
      ...res,
      data: validated(parseScraperPerformerSearchResponse, res.data),
    }))
  },

  searchScraperScenes(body: {query: string; limit?: number}) {
    return apiClient.post(API_ROUTES.scraperSearchScenes, body).then((res) => ({
      ...res,
      data: validated(parseSceneScraperSearchResponse, res.data),
    }))
  },

  matchScraperScenes(body: {mediaId: number; query?: string; limit?: number}) {
    return apiClient.post(API_ROUTES.scraperMatchScenes, body).then((res) => ({
      ...res,
      data: validated(parseSceneScraperSearchResponse, res.data),
    }))
  },

  fetchSceneMarkers(sceneId: string) {
    return apiClient.post(API_ROUTES.scraperSceneMarkers, {sceneId}).then((res) => ({
      ...res,
      data: validated(parseSceneScraperMarkersResponse, res.data),
    }))
  },

  applySceneMarkers(body: {
    sceneId: string
    mediaId: number
    merge?: 'merge' | 'replace'
    markerMetaId?: number | null
  }) {
    return apiClient.post(API_ROUTES.scraperSceneMarkersApply, body).then((res) => ({
      ...res,
      data: validated(parseSceneScraperMarkersApplyResult, res.data),
    }))
  },

  searchCamGirlFinder(body: Record<string, unknown>) {
    return apiClient.post(API_ROUTES.scraperCamGirlFinderSearch, body).then((res) => ({
      ...res,
      data: validated(parseCamGirlFinderSearchResponse, res.data),
    }))
  },
}
