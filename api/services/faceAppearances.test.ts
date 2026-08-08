/**
 * @vitest-environment node
 */
import {describe, expect, it, vi} from 'vitest'

const {countByTagId, findByTagId} = vi.hoisted(() => ({
  countByTagId: vi.fn(),
  findByTagId: vi.fn(),
}))

vi.mock('../db/repositories/faces', () => ({
  createFacesRepository: () => ({countByTagId, findByTagId}),
}))

import {listFacesForTag} from './faceAppearances'

describe('listFacesForTag', () => {
  it('returns countOnly without listing rows', () => {
    countByTagId.mockReturnValue(3)
    const result = listFacesForTag({drizzle: {}} as never, 10, {countOnly: true})
    expect(result).toEqual({items: [], count: 3})
    expect(findByTagId).not.toHaveBeenCalled()
  })

  it('maps segmentStart and strips embeddings via repo join rows', () => {
    countByTagId.mockReturnValue(1)
    findByTagId.mockReturnValue([{
      faceId: 5,
      mediaId: 100,
      timestamp: '01:02:03',
      matchScore: 0.9,
      cropPath: 'faces/100/5.jpg',
      path: '/a.mp4',
      name: 'A',
      basename: 'a.mp4',
      mediaTypeId: 1,
      mediaCreatedAt: '2024-01-01T00:00:00.000Z',
    }])

    const result = listFacesForTag({drizzle: {}} as never, 10, {sort: 'time'})
    expect(result.count).toBe(1)
    expect(result.items[0]).toEqual({
      id: 100,
      faceId: 5,
      key: 'face-5',
      path: '/a.mp4',
      name: 'A',
      basename: 'a.mp4',
      mediaTypeId: 1,
      timestamp: '01:02:03',
      segmentStart: 3723,
      matchScore: 0.9,
      cropPath: 'faces/100/5.jpg',
    })
    expect(result.items[0]).not.toHaveProperty('embedding')
  })
})
