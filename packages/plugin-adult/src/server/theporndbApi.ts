import axios from 'axios'
import type { ApiDb } from '../../../../api/types/db'
import { resolveTpdbApiKey } from './tpdbApiKey'

const TPDB_GRAPHQL_URL = 'https://theporndb.net/graphql'
const TPDB_REST_URL = 'https://api.theporndb.net'

const SCENE_FIELDS = `
  id
  title
  date
  release_date
  duration
  details
  code
  images {
    url
    width
    height
  }
  studio {
    id
    name
  }
  performers {
    performer {
      id
      name
    }
  }
  tags {
    id
    name
  }
`

const SEARCH_SCENE_QUERY = `
  query SearchScene($term: String!, $limit: Int) {
    searchScene(term: $term, limit: $limit) {
      ${SCENE_FIELDS}
    }
  }
`

const FIND_SCENES_BY_FINGERPRINTS_QUERY = `
  query FindScenesByFingerprints($fingerprints: [[FingerprintQueryInput!]!]) {
    findScenesBySceneFingerprints(fingerprints: $fingerprints) {
      ${SCENE_FIELDS}
    }
  }
`

export interface TpdbSceneImage {
  url?: string
  width?: number
  height?: number
}

export interface TpdbScenePerformer {
  id?: string
  name?: string
}

export interface TpdbScenePerformerAppearance {
  performer?: TpdbScenePerformer
}

export interface TpdbSceneTag {
  id?: string
  name?: string
}

export interface TpdbSceneStudio {
  id?: string
  name?: string
}

export interface TpdbScene {
  id: string
  title?: string
  date?: string | null
  release_date?: string | null
  duration?: number | null
  details?: string | null
  code?: string | null
  images?: TpdbSceneImage[]
  studio?: TpdbSceneStudio | null
  performers?: TpdbScenePerformerAppearance[]
  tags?: TpdbSceneTag[]
}

export interface TpdbMarker {
  title?: string
  start_time?: number | string | null
  end_time?: number | string | null
}

export interface TpdbPerformerSearchParams {
  q?: string
  gender?: string
  page?: number
  perPage?: number
}

interface TpdbSceneRestResponse {
  data?: {
    markers?: TpdbMarker[] | null
  } | null
}

interface TpdbSearchGraphqlResponse {
  data?: {
    searchScene?: TpdbScene[] | null
  }
  errors?: Array<{ message?: string }>
}

interface TpdbFingerprintGraphqlResponse {
  data?: {
    findScenesBySceneFingerprints?: TpdbScene[][] | null
  }
  errors?: Array<{ message?: string }>
}

type TpdbRequestContext = {
  db?: ApiDb | null
  apiKey?: string
}

function resolveApiKey(ctx?: TpdbRequestContext): string {
  const explicit = String(ctx?.apiKey || '').trim()
  if (explicit) return explicit
  return resolveTpdbApiKey(ctx?.db).key
}

function normalizeOshash(value: string): string {
  return String(value || '').trim().toLowerCase()
}

function flattenFingerprintMatches(groups: TpdbScene[][] | null | undefined): TpdbScene[] {
  if (!groups?.length) return []

  const seen = new Set<string>()
  const scenes: TpdbScene[] = []

  for (const group of groups) {
    for (const scene of group || []) {
      if (!scene?.id || seen.has(scene.id)) continue
      seen.add(scene.id)
      scenes.push(scene)
    }
  }

  return scenes
}

async function postTpdbGraphql<T>(
  query: string,
  variables: Record<string, unknown>,
  ctx?: TpdbRequestContext,
): Promise<T> {
  const apiKey = resolveApiKey(ctx)

  if (!apiKey) {
    throw new Error('ThePornDB API key is not configured')
  }

  const response = await axios.post<T & { errors?: Array<{ message?: string }> }>(
    TPDB_GRAPHQL_URL,
    {query, variables},
    {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      validateStatus: (status) => status >= 200 && status < 300,
    },
  )

  const graphqlErrors = response.data?.errors
  if (graphqlErrors?.length) {
    throw new Error(graphqlErrors.map((item) => item.message).filter(Boolean).join('; ') || 'GraphQL error')
  }

  return response.data
}

export async function searchTpdbScenes(
  term: string,
  {limit = 24}: {limit?: number} = {},
  ctx?: TpdbRequestContext,
): Promise<TpdbScene[]> {
  const response = await postTpdbGraphql<TpdbSearchGraphqlResponse>(
    SEARCH_SCENE_QUERY,
    {term, limit},
    ctx,
  )

  return response.data?.searchScene || []
}

export async function findTpdbScenesByOshash(
  oshash: string,
  ctx?: TpdbRequestContext,
): Promise<TpdbScene[]> {
  const hash = normalizeOshash(oshash)
  if (!hash) return []

  const response = await postTpdbGraphql<TpdbFingerprintGraphqlResponse>(
    FIND_SCENES_BY_FINGERPRINTS_QUERY,
    {
      fingerprints: [[{
        hash,
        algorithm: 'OSHASH',
      }]],
    },
    ctx,
  )

  return flattenFingerprintMatches(response.data?.findScenesBySceneFingerprints)
}

export function normalizeTpdbMarkerTime(value: unknown): number | null {
  if (value == null || value === '') return null

  const numeric = Number(value)
  if (Number.isFinite(numeric)) {
    return Math.max(0, Math.floor(numeric))
  }

  const parts = String(value).trim().split(':').map((part) => Number(part))
  if (parts.some((part) => !Number.isFinite(part))) return null

  if (parts.length === 3) {
    return Math.max(0, Math.floor(parts[0] * 3600 + parts[1] * 60 + parts[2]))
  }

  if (parts.length === 2) {
    return Math.max(0, Math.floor(parts[0] * 60 + parts[1]))
  }

  return null
}

export function parseTpdbMarkers(markers: TpdbMarker[] | null | undefined) {
  const parsed: Array<{ title: string; time: number; end: number | null }> = []

  for (const marker of markers || []) {
    const time = normalizeTpdbMarkerTime(marker.start_time)
    if (time == null) continue

    const title = String(marker.title || '').trim() || 'Marker'
    const endValue = normalizeTpdbMarkerTime(marker.end_time)
    const end = endValue != null && endValue > time ? endValue : null

    parsed.push({ title, time, end })
  }

  return parsed
}

async function getTpdbRest<T>(path: string, ctx?: TpdbRequestContext): Promise<T> {
  const apiKey = resolveApiKey(ctx)
  if (!apiKey) {
    throw new Error('ThePornDB API key is not configured')
  }

  const response = await axios.get<T>(
    `${TPDB_REST_URL}${path}`,
    {
      timeout: 30000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      validateStatus: (status) => status >= 200 && status < 300,
    },
  )

  return response.data
}

export function buildTpdbPerformersPath(params: TpdbPerformerSearchParams = {}): string {
  const query = new URLSearchParams()
  const q = String(params.q || '').trim()
  const gender = String(params.gender || '').trim()
  const page = params.page == null ? undefined : Number(params.page)
  const perPage = params.perPage == null ? undefined : Number(params.perPage)

  if (q) query.set('q', q)
  if (gender) query.set('gender', gender)
  if (page != null && Number.isFinite(page) && page > 0) {
    query.set('page', String(Math.floor(page)))
  }
  if (perPage != null && Number.isFinite(perPage) && perPage > 0) {
    query.set('per_page', String(Math.min(Math.max(Math.floor(perPage), 1), 100)))
  }

  const qs = query.toString()
  return qs ? `/performers?${qs}` : '/performers'
}

export async function searchTpdbPerformers(
  params: TpdbPerformerSearchParams = {},
  ctx?: TpdbRequestContext,
): Promise<unknown> {
  return getTpdbRest(buildTpdbPerformersPath(params), ctx)
}

export async function fetchTpdbSceneMarkers(sceneId: string, ctx?: TpdbRequestContext) {
  const id = String(sceneId || '').trim()
  if (!id) return []

  const response = await getTpdbRest<TpdbSceneRestResponse>(
    `/scenes/${encodeURIComponent(id)}`,
    ctx,
  )
  return parseTpdbMarkers(response.data?.markers)
}

export {
  flattenFingerprintMatches,
  normalizeOshash,
}
