import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ApiRequest, ApiResponse } from '../types/http'

const {
  create,
  findAll,
  updateById,
  deleteById,
  getManualPlaylistsSummary,
  hardDeletePlaylistCascade,
  softDeletePlaylist,
} = vi.hoisted(() => ({
  create: vi.fn(),
  findAll: vi.fn(),
  updateById: vi.fn(),
  deleteById: vi.fn(),
  getManualPlaylistsSummary: vi.fn(),
  hardDeletePlaylistCascade: vi.fn(),
  softDeletePlaylist: vi.fn(),
}))

vi.mock('../db/repositories/playlists', () => ({
  createPlaylistsRepository: () => ({
    create,
    findAll,
    updateById,
    deleteById,
  }),
}))

vi.mock('../services/playlistSummary', () => ({
  getManualPlaylistsSummary,
}))

vi.mock('../services/entityTrash', () => ({
  ENTITY_TRASH_RETENTION_DAYS: 30,
  countTrashPlaylists: vi.fn(),
  getTrashedPlaylistsForPurge: vi.fn(),
  hardDeletePlaylistCascade,
  listExpiredPlaylistIds: vi.fn(),
  listTrashPlaylists: vi.fn(),
  restoreTrashPlaylists: vi.fn(),
  softDeletePlaylist,
}))

import createPlaylistController from './Playlist.controller'

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
    sendStatus(code: number) {
      res.statusCode = code
      return res
    },
  }

  return res as ApiResponse & {statusCode: number; body: unknown}
}

describe('Playlist.controller', () => {
  const fakeDb = {drizzle: {}} as never
  const controller = createPlaylistController(fakeDb)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a playlist', () => {
    create.mockReturnValue({id: 3, name: 'Favorites'})

    const req = {body: {name: 'Favorites'}} as ApiRequest
    const res = createResponse()

    controller.create(req, res)

    expect(create).toHaveBeenCalledWith({name: 'Favorites'})
    expect(res.statusCode).toBe(201)
    expect(res.body).toEqual({id: 3, name: 'Favorites'})
  })

  it('returns playlist catalog rows without membership links', () => {
    findAll.mockReturnValue([
      {id: 1, name: 'A'},
      {id: 2, name: 'B'},
    ])

    const req = {} as ApiRequest
    const res = createResponse()

    controller.findAll(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual([
      {id: 1, name: 'A'},
      {id: 2, name: 'B'},
    ])
  })

  it('returns manual playlist summary', async () => {
    getManualPlaylistsSummary.mockResolvedValue([{id: 1, count: 5}])

    const req = {} as ApiRequest
    const res = createResponse()

    await controller.findSummary(req, res)

    expect(getManualPlaylistsSummary).toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual([{id: 1, count: 5}])
  })

  it('updates a playlist by id', () => {
    const req = {
      params: {id: '4'},
      body: {name: 'Updated'},
    } as unknown as ApiRequest
    const res = createResponse()

    controller.update(req, res)

    expect(updateById).toHaveBeenCalledWith(4, {name: 'Updated'})
    expect(res.statusCode).toBe(200)
  })

  it('deletes a playlist by id', () => {
    const req = {params: {id: '9'}, query: {permanent: '1'}} as unknown as ApiRequest
    const res = createResponse()

    controller.deleteOne(req, res)

    expect(hardDeletePlaylistCascade).toHaveBeenCalledWith(fakeDb, 9)
    expect(res.statusCode).toBe(200)
  })

  it('returns 500 when summary lookup fails', async () => {
    getManualPlaylistsSummary.mockRejectedValue(new Error('summary failed'))

    const req = {} as ApiRequest
    const res = createResponse()

    await controller.findSummary(req, res)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({message: 'summary failed'})
  })
})
