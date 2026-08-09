/**
 * @vitest-environment node
 */
import {describe, expect, it, vi} from 'vitest'
import {
  buildSceneUpdateInput,
  createStashGraphqlClient,
  normalizeStashGraphqlUrl,
} from './stashGraphqlClient'
import {
  mapMediaChipsRatingToStash,
  parseStashOldId,
} from '../stashImport/mapEntities'

describe('stash graphql push helpers', () => {
  it('normalizes graphql url', () => {
    expect(normalizeStashGraphqlUrl('http://127.0.0.1:9999')).toBe('http://127.0.0.1:9999/graphql')
    expect(normalizeStashGraphqlUrl('http://127.0.0.1:9999/graphql')).toBe('http://127.0.0.1:9999/graphql')
  })

  it('maps rating and parses oldIds', () => {
    expect(mapMediaChipsRatingToStash(5)).toBe(100)
    expect(mapMediaChipsRatingToStash(2.5)).toBe(50)
    expect(parseStashOldId('stash:scene:12')).toEqual({kind: 'scene', id: 12})
    expect(parseStashOldId('stash:tag:3')).toEqual({kind: 'tag', id: 3})
    expect(parseStashOldId('jellyfin:item:1')).toBeNull()
  })

  it('builds sceneUpdate input', () => {
    expect(buildSceneUpdateInput({
      sceneId: 9,
      rating: 80,
      tagIds: [1, 2],
      performerIds: [4],
      studioId: 7,
    })).toEqual({
      id: '9',
      rating100: 80,
      tag_ids: ['1', '2'],
      performer_ids: ['4'],
      studio_id: '7',
    })
  })

  it('sceneUpdate posts GraphQL mutation', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({data: {sceneUpdate: {id: '9'}}}),
    }))

    const client = createStashGraphqlClient({
      graphqlUrl: 'http://stash.local:9999',
      apiKey: 'secret',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await client.sceneUpdate(buildSceneUpdateInput({
      sceneId: 9,
      rating: 60,
      tagIds: [2],
    }))

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(String(call[0])).toBe('http://stash.local:9999/graphql')
    expect(call[1]?.headers).toMatchObject({ApiKey: 'secret'})
    const body = JSON.parse(String(call[1]?.body))
    expect(body.variables.input).toEqual({
      id: '9',
      rating100: 60,
      tag_ids: ['2'],
    })
  })
})
