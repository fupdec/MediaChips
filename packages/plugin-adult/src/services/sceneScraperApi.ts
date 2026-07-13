import { apiClient } from '@/services/apiClient'
import { API_ROUTES } from '@shared/api/routes'
import { parseSceneScraperSearchResponse } from '@/schemas/sceneScraper'
import {
  parseSceneScraperMarkersApplyResult,
  parseSceneScraperMarkersResponse,
} from '@/schemas/sceneScraper'
import type {
  SceneScraperMarkersApplyResult,
  SceneScraperMarkersResponse,
  SceneScraperSearchResponse,
} from '@/types/sceneScraper'
import axios from 'axios'

function extractApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message
    if (typeof message === 'string' && message.trim()) return message
  }

  if (error instanceof Error && error.message) return error.message
  return 'Scene search failed'
}

async function postSceneScraperRequest(
  route: string,
  body: Record<string, unknown>,
): Promise<SceneScraperSearchResponse> {
  try {
    const response = await apiClient.post(route, body)
    return parseSceneScraperSearchResponse(response.data)
  } catch (error) {
    throw new Error(extractApiErrorMessage(error))
  }
}

export async function searchScraperScenes(
  query: string,
  {limit = 24}: {limit?: number} = {},
): Promise<SceneScraperSearchResponse> {
  return postSceneScraperRequest(API_ROUTES.scraperSearchScenes, {
    query,
    limit,
  })
}

export async function matchScraperScenes({
  mediaId,
  query,
  limit = 24,
}: {
  mediaId: number
  query?: string
  limit?: number
}): Promise<SceneScraperSearchResponse> {
  return postSceneScraperRequest(API_ROUTES.scraperMatchScenes, {
    mediaId,
    query,
    limit,
  })
}

export async function fetchSceneMarkers(sceneId: string): Promise<SceneScraperMarkersResponse> {
  try {
    const response = await apiClient.post(API_ROUTES.scraperSceneMarkers, { sceneId })
    return parseSceneScraperMarkersResponse(response.data)
  } catch (error) {
    throw new Error(extractApiErrorMessage(error))
  }
}

export async function applySceneMarkersFromTpdb({
  sceneId,
  mediaId,
  merge = 'merge',
  markerMetaId = null,
}: {
  sceneId: string
  mediaId: number
  merge?: 'merge' | 'replace'
  markerMetaId?: number | null
}): Promise<SceneScraperMarkersApplyResult> {
  try {
    const response = await apiClient.post(API_ROUTES.scraperSceneMarkersApply, {
      sceneId,
      mediaId,
      merge,
      markerMetaId,
    })
    return parseSceneScraperMarkersApplyResult(response.data)
  } catch (error) {
    throw new Error(extractApiErrorMessage(error))
  }
}
