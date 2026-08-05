import {
  parseSceneScraperMarkersApplyResult as parseApplyShared,
  parseSceneScraperMarkersResponse as parseMarkersShared,
  parseSceneScraperSearchResponse as parseSearchShared,
} from '@shared/schemas'
import type {SceneScraperSearchResponse} from '../types/sceneScraper'

export {
  SceneScraperImageSchema,
  SceneScraperMarkerSchema,
  SceneScraperMarkersApplyResultSchema,
  SceneScraperMarkersResponseSchema,
  SceneScraperPerformerSchema,
  SceneScraperSceneSchema,
  SceneScraperSearchResponseSchema,
} from '@shared/schemas/scrapers'

export function parseSceneScraperSearchResponse(data: unknown): SceneScraperSearchResponse {
  return parseSearchShared(data) as SceneScraperSearchResponse
}

export function parseSceneScraperMarkersResponse(data: unknown) {
  return parseMarkersShared(data)
}

export function parseSceneScraperMarkersApplyResult(data: unknown) {
  return parseApplyShared(data)
}
