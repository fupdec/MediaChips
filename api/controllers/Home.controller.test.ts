import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ApiRequest, ApiResponse } from '../types/http'

const {
  getHomeMedia,
  getRandomMarks,
  getHomeHealth,
  getHomeHealthLite,
  getHomeExtendedStats,
  getHomeSimilar,
  getCreatedCalendarMonth,
  searchMediaByName,
  searchTagsByName,
  searchGlobal,
} = vi.hoisted(() => ({
  getHomeMedia: vi.fn(),
  getRandomMarks: vi.fn(),
  getHomeHealth: vi.fn(),
  getHomeHealthLite: vi.fn(),
  getHomeExtendedStats: vi.fn(),
  getHomeSimilar: vi.fn(),
  getCreatedCalendarMonth: vi.fn(),
  searchMediaByName: vi.fn(),
  searchTagsByName: vi.fn(),
  searchGlobal: vi.fn(),
}))

vi.mock('../services/homeMedia', () => ({
  getHomeMedia,
}))

vi.mock('../services/homeMarkers', () => ({
  getRandomMarks,
}))

vi.mock('../services/homeHealth', () => ({
  getHomeHealth,
  getHomeHealthLite,
}))

vi.mock('../services/homeExtendedStats', () => ({
  getHomeExtendedStats,
}))

vi.mock('../services/homeSimilar', () => ({
  getHomeSimilar,
}))

vi.mock('../services/homeCreatedCalendar', () => ({
  getCreatedCalendarMonth,
}))

vi.mock('../services/globalSearch', () => ({
  searchMediaByName,
  searchTagsByName,
  searchGlobal,
}))

import createHomeController from './Home.controller'

function createResponse() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code
      return res
    },
    send(payload: unknown) {
      res.body = payload
      return res
    },
  }

  return res as ApiResponse & {statusCode: number; body: unknown}
}

describe('Home.controller', () => {
  const controller = createHomeController({} as never)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns home media with parsed limits', async () => {
    const payload = {continue: [], favorites: [], topViews: []}
    getHomeMedia.mockResolvedValue(payload)

    const req = {
      query: {
        continueLimit: '5',
        favoritesLimit: '6',
        topViewsLimit: '7',
      },
    } as unknown as ApiRequest
    const res = createResponse()

    await controller.getMedia(req, res)

    expect(getHomeMedia).toHaveBeenCalledWith({}, {
      continue: 5,
      favorites: 6,
      topViews: 7,
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual(payload)
  })

  it('returns random markers with a capped limit', async () => {
    getRandomMarks.mockResolvedValue([{id: 1}])

    const req = {query: {limit: '99'}} as unknown as ApiRequest
    const res = createResponse()

    await controller.getMarkers(req, res)

    expect(getRandomMarks).toHaveBeenCalledWith({}, 16)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({marks: [{id: 1}]})
  })

  it('returns home similar media', async () => {
    const payload = {seed: {id: 7, name: 'Seed', reason: 'viewed'}, items: [{id: 8}]}
    getHomeSimilar.mockResolvedValue(payload)

    const req = {query: {limit: '6'}} as unknown as ApiRequest
    const res = createResponse()

    await controller.getSimilar(req, res)

    expect(getHomeSimilar).toHaveBeenCalledWith({}, {limit: 6})
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual(payload)
  })

  it('returns created calendar for a month', async () => {
    const payload = {
      year: 2026,
      month: 8,
      days: [{day: '2026-08-12', count: 3}],
      totalInMonth: 3,
      totalWithDate: 10,
      totalMissingDate: 2,
    }
    getCreatedCalendarMonth.mockReturnValue(payload)

    const req = {query: {year: '2026', month: '8'}} as unknown as ApiRequest
    const res = createResponse()

    await controller.getCreatedCalendar(req, res)

    expect(getCreatedCalendarMonth).toHaveBeenCalledWith({}, 2026, 8)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual(payload)
  })

  it('returns 500 when extended stats fail', async () => {
    getHomeExtendedStats.mockRejectedValue(new Error('db unavailable'))

    const req = {} as ApiRequest
    const res = createResponse()

    await controller.getExtendedStats(req, res)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({message: 'db unavailable'})
  })

  it('searches globally using the request body query', async () => {
    searchGlobal.mockResolvedValue({media: [], tags: []})

    const req = {body: {q: 'matrix'}} as ApiRequest
    const res = createResponse()

    await controller.searchGlobal(req, res)

    expect(searchGlobal).toHaveBeenCalledWith({}, 'matrix', {
      limit: undefined,
      tagIds: undefined,
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({media: [], tags: []})
  })
})
