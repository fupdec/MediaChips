import axios from 'axios'

const TPDB_GRAPHQL_URL = 'https://theporndb.net/graphql'

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

function getTpdbApiKey(): string {
  return String(process.env.TPDB_API_KEY || '').trim()
}

export function isTpdbConfigured(): boolean {
  return getTpdbApiKey().length > 0
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

async function postTpdbGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const apiKey = getTpdbApiKey()

  if (!apiKey) {
    throw new Error('TPDB_API_KEY is not configured')
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
): Promise<TpdbScene[]> {
  const response = await postTpdbGraphql<TpdbSearchGraphqlResponse>(
    SEARCH_SCENE_QUERY,
    {term, limit},
  )

  return response.data?.searchScene || []
}

export async function findTpdbScenesByOshash(oshash: string): Promise<TpdbScene[]> {
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
  )

  return flattenFingerprintMatches(response.data?.findScenesBySceneFingerprints)
}

export {
  flattenFingerprintMatches,
  normalizeOshash,
}
