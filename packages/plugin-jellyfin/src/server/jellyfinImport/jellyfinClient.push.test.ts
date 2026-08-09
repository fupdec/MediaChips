/**
 * @vitest-environment node
 */
import {describe, expect, it, vi} from 'vitest'
import {createJellyfinClient} from './jellyfinClient'
import {
  mapMediaChipsRatingToJellyfin,
  parseJellyfinItemOldId,
} from './mapEntities'

describe('jellyfin push helpers', () => {
  it('maps MediaChips rating to Jellyfin 0–10', () => {
    expect(mapMediaChipsRatingToJellyfin(null)).toBeNull()
    expect(mapMediaChipsRatingToJellyfin(0)).toBe(0)
    expect(mapMediaChipsRatingToJellyfin(5)).toBe(10)
    expect(mapMediaChipsRatingToJellyfin(4)).toBe(8)
  })

  it('parses jellyfin item oldIds', () => {
    expect(parseJellyfinItemOldId('jellyfin:item:abc')).toBe('abc')
    expect(parseJellyfinItemOldId('emby:item:xyz', 'emby')).toBe('xyz')
    expect(parseJellyfinItemOldId('stash:scene:1')).toBeNull()
  })

  it('updateItemMetadata GETs then POSTs rating and genres', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method || 'GET'
      if (method === 'GET') {
        return {
          ok: true,
          status: 200,
          headers: {get: () => 'application/json'},
          json: async () => ({
            Id: 'item1',
            Name: 'Movie',
            CommunityRating: 6,
            Genres: ['Old'],
          }),
          text: async (): Promise<string> => '',
        }
      }
      return {
        ok: true,
        status: 204,
        headers: {get: () => ''},
        json: async (): Promise<null> => null,
        text: async (): Promise<string> => '',
      }
    })

    const client = createJellyfinClient({
      baseUrl: 'http://jf.local:8096',
      apiKey: 'key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await client.updateItemMetadata('item1', {
      communityRating: 8,
      genres: ['Action', 'Drama'],
    })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const postCall = fetchImpl.mock.calls[1]
    expect(String(postCall[0])).toContain('/Items/item1')
    expect(postCall[1]?.method).toBe('POST')
    const body = JSON.parse(String(postCall[1]?.body))
    expect(body.CommunityRating).toBe(8)
    expect(body.Genres).toEqual(['Action', 'Drama'])
  })
})
