export type StashSceneUpdateInput = {
  id: string
  rating100?: number | null
  tag_ids?: string[]
  performer_ids?: string[]
  studio_id?: string | null
}

export type StashGraphqlClient = {
  sceneUpdate: (input: StashSceneUpdateInput) => Promise<{id: string}>
}

const SCENE_UPDATE_MUTATION = `
mutation SceneUpdate($input: SceneUpdateInput!) {
  sceneUpdate(input: $input) {
    id
  }
}
`

export function normalizeStashGraphqlUrl(url: string): string {
  const trimmed = String(url || '').trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  if (trimmed.endsWith('/graphql')) return trimmed
  return `${trimmed}/graphql`
}

export function createStashGraphqlClient(options: {
  graphqlUrl: string
  apiKey: string
  fetchImpl?: typeof fetch
}): StashGraphqlClient {
  const endpoint = normalizeStashGraphqlUrl(options.graphqlUrl)
  const apiKey = String(options.apiKey || '').trim()
  const fetchImpl = options.fetchImpl ?? fetch

  if (!endpoint) {
    throw new Error('Stash GraphQL URL is required')
  }
  if (!apiKey) {
    throw new Error('Stash API key is required')
  }

  async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ApiKey: apiKey,
      },
      body: JSON.stringify({query, variables}),
    })

    const payload = await response.json().catch(() => null) as {
      data?: T
      errors?: Array<{message?: string}>
    } | null

    if (!response.ok) {
      const message = payload?.errors?.[0]?.message
        || `Stash GraphQL request failed (${response.status})`
      throw new Error(message)
    }

    if (payload?.errors?.length) {
      throw new Error(payload.errors[0]?.message || 'Stash GraphQL error')
    }

    if (!payload?.data) {
      throw new Error('Stash GraphQL returned empty data')
    }

    return payload.data
  }

  return {
    async sceneUpdate(input) {
      const data = await graphql<{sceneUpdate?: {id?: string} | null}>(
        SCENE_UPDATE_MUTATION,
        {input},
      )
      const id = data.sceneUpdate?.id
      if (!id) throw new Error('Stash sceneUpdate returned no id')
      return {id: String(id)}
    },
  }
}

/** Build sceneUpdate variables from MediaChips rating + stash oldIds. Exported for tests. */
export function buildSceneUpdateInput(options: {
  sceneId: number
  rating?: number | null
  tagIds?: number[]
  performerIds?: number[]
  studioId?: number | null
}): StashSceneUpdateInput {
  const input: StashSceneUpdateInput = {
    id: String(options.sceneId),
  }
  if (options.rating != null) {
    input.rating100 = options.rating
  }
  if (options.tagIds) {
    input.tag_ids = options.tagIds.map(String)
  }
  if (options.performerIds) {
    input.performer_ids = options.performerIds.map(String)
  }
  if (Object.prototype.hasOwnProperty.call(options, 'studioId')) {
    input.studio_id = options.studioId == null ? null : String(options.studioId)
  }
  return input
}
