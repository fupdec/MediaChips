import {typedApi} from '@/services/typedApi'
import {
  parseSceneScraperMarkersApplyResult,
  parseSceneScraperMarkersResponse,
  parseSceneScraperSearchResponse,
} from '../schemas/sceneScraper'
import type {
  SceneScraperMarkersApplyResult,
  SceneScraperMarkersResponse,
  SceneScraperSearchResponse,
} from '../types/sceneScraper'
import axios from 'axios'

function extractApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message
    if (typeof message === 'string' && message.trim()) return message
  }

  if (error instanceof Error && error.message) return error.message
  return 'Scene search failed'
}

export async function searchScraperScenes(
  query: string,
  {limit = 24}: {limit?: number} = {},
): Promise<SceneScraperSearchResponse> {
  try {
    const {data} = await typedApi.searchScraperScenes({query, limit})
    return parseSceneScraperSearchResponse(data)
  } catch (error) {
    throw new Error(extractApiErrorMessage(error), {cause: error})
  }
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
  try {
    const {data} = await typedApi.matchScraperScenes({mediaId, query, limit})
    return parseSceneScraperSearchResponse(data)
  } catch (error) {
    throw new Error(extractApiErrorMessage(error), {cause: error})
  }
}

export async function fetchSceneMarkers(sceneId: string): Promise<SceneScraperMarkersResponse> {
  try {
    const {data} = await typedApi.fetchSceneMarkers(sceneId)
    return parseSceneScraperMarkersResponse(data)
  } catch (error) {
    throw new Error(extractApiErrorMessage(error), {cause: error})
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
    const {data} = await typedApi.applySceneMarkers({
      sceneId,
      mediaId,
      merge,
      markerMetaId,
    })
    return parseSceneScraperMarkersApplyResult(data)
  } catch (error) {
    throw new Error(extractApiErrorMessage(error), {cause: error})
  }
}
