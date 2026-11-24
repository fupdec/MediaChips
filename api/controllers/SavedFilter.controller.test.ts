import {beforeEach, describe, expect, it, vi} from 'vitest'
import type {ApiRequest, ApiResponse} from '../types/http'

const mocks = vi.hoisted(() => ({
  repo: {
    create: vi.fn(),
    findOrCreate: vi.fn(),
    findById: vi.fn(),
    findAllNamed: vi.fn(),
    updateById: vi.fn(),
  },
  invalidate: vi.fn(),
  getDynamicPlaylistsBasic: vi.fn(),
  getDynamicPlaylistsSummary: vi.fn(),
  getSavedFilterPlaylistSummary: vi.fn(),
  getSavedFiltersHydrated: vi.fn(),
  findOrCreateSavedFilterHydrated: vi.fn(),
  getFilteredMediaForPlayback: vi.fn(),
  getFilteredMediaForSavedFilter: vi.fn(),
  countTrash: vi.fn(),
  getTrashedForPurge: vi.fn(),
  hardDelete: vi.fn(),
  listExpiredIds: vi.fn(),
  listTrash: vi.fn(),
  restoreTrash: vi.fn(),
  softDelete: vi.fn(),
}))

vi.mock('../db/repositories/savedFilters', () => ({createSavedFiltersRepository: () => mocks.repo}))
vi.mock('../services/mediaCacheInvalidation', () => ({invalidateMediaDerivedCaches: mocks.invalidate}))
vi.mock('../services/savedFilterMedia', () => ({
  getDynamicPlaylistsBasic: mocks.getDynamicPlaylistsBasic,
  getDynamicPlaylistsSummary: mocks.getDynamicPlaylistsSummary,
  getSavedFilterPlaylistSummary: mocks.getSavedFilterPlaylistSummary,
  getSavedFiltersHydrated: mocks.getSavedFiltersHydrated,
  findOrCreateSavedFilterHydrated: mocks.findOrCreateSavedFilterHydrated,
  getFilteredMediaForPlayback: mocks.getFilteredMediaForPlayback,
  getFilteredMediaForSavedFilter: mocks.getFilteredMediaForSavedFilter,
}))
vi.mock('../services/entityTrash', () => ({
  ENTITY_TRASH_RETENTION_DAYS: 30,
  countTrashSavedFilters: mocks.countTrash,
  getTrashedSavedFiltersForPurge: mocks.getTrashedForPurge,
  hardDeleteSavedFilterCascade: mocks.hardDelete,
  listExpiredSavedFilterIds: mocks.listExpiredIds,
  listTrashSavedFilters: mocks.listTrash,
  restoreTrashSavedFilters: mocks.restoreTrash,
  softDeleteSavedFilter: mocks.softDelete,
}))

import createSavedFilterController from './SavedFilter.controller'

function createResponse() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { res.statusCode = code; return res },
    send(payload: unknown) { res.body = payload; return res },
    sendStatus(code: number) { res.statusCode = code; return res },
  }
  return res as unknown as ApiResponse & {statusCode: number; body: unknown}
}

const request = (init: {body?: unknown; params?: unknown; query?: unknown} = {}) =>
  ({body: init.body ?? {}, params: init.params ?? {}, query: init.query ?? {}}) as unknown as ApiRequest

describe('SavedFilter.controller', () => {
  const controller = createSavedFilterController({drizzle: {}} as never)

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  describe('create', () => {
    it('creates a named filter outright and reports it as created', () => {
      mocks.repo.create.mockReturnValue({id: 7, name: 'Best'})
      const res = createResponse()
      controller.create(request({body: {name: 'Best', mediaTypeId: 1, sortBy: 'rating'}}), res)
      expect(mocks.repo.create).toHaveBeenCalledWith(expect.objectContaining({name: 'Best', mediaTypeId: 1, sortBy: 'rating', metaId: null, icon: null}))
      expect(mocks.repo.findOrCreate).not.toHaveBeenCalled()
      expect(res.statusCode).toBe(201)
      expect(res.body).toEqual([{id: 7, name: 'Best'}, true])
      expect(mocks.invalidate).toHaveBeenCalled()
    })

    it('reuses an existing unnamed filter instead of creating a duplicate', () => {
      mocks.repo.findOrCreate.mockReturnValue({row: {id: 3}, created: false})
      const res = createResponse()
      controller.create(request({body: {mediaTypeId: 1, tagId: 5}}), res)
      expect(mocks.repo.create).not.toHaveBeenCalled()
      expect(res.body).toEqual([{id: 3}, false])
    })

    it('answers with an error and does not touch caches when the repository fails', () => {
      mocks.repo.create.mockImplementation(() => { throw new Error('disk full') })
      const res = createResponse()
      controller.create(request({body: {name: 'x'}}), res)
      expect(res.statusCode).toBeGreaterThanOrEqual(400)
      expect(mocks.invalidate).not.toHaveBeenCalled()
    })
  })

  describe('reading and updating', () => {
    it('returns the filter or null for an unknown id', () => {
      mocks.repo.findById.mockReturnValueOnce({id: 2}).mockReturnValueOnce(undefined)
      const found = createResponse()
      controller.findOne(request({params: {id: '2'}}), found)
      expect(mocks.repo.findById).toHaveBeenCalledWith(2)
      expect(found.body).toEqual({id: 2})
      const missing = createResponse()
      controller.findOne(request({params: {id: '99'}}), missing)
      expect(missing.statusCode).toBe(200)
      expect(missing.body).toBeNull()
    })

    it('lists named filters with the request body as options', () => {
      mocks.repo.findAllNamed.mockReturnValue([{id: 1}])
      const res = createResponse()
      controller.findAll(request({body: {mediaTypeId: 1}}), res)
      expect(mocks.repo.findAllNamed).toHaveBeenCalledWith({mediaTypeId: 1})
      expect(res.body).toEqual([{id: 1}])
    })

    it('updates by numeric id and invalidates derived caches', () => {
      const res = createResponse()
      controller.update(request({params: {id: '4'}, body: {name: 'Renamed'}}), res)
      expect(mocks.repo.updateById).toHaveBeenCalledWith(4, {name: 'Renamed'})
      expect(res.statusCode).toBe(200)
      expect(mocks.invalidate).toHaveBeenCalled()
    })
  })

  describe('deleteOne', () => {
    it('moves the filter to the trash by default', () => {
      const res = createResponse()
      controller.deleteOne(request({params: {id: '5'}}), res)
      expect(mocks.softDelete).toHaveBeenCalledWith(expect.anything(), 5)
      expect(mocks.hardDelete).not.toHaveBeenCalled()
      expect(res.body).toEqual({deletedIds: [5], softDeleted: true})
      expect(mocks.invalidate).toHaveBeenCalled()
    })

    it('deletes permanently only when asked, through the query string or the body', () => {
      const viaQuery = createResponse()
      controller.deleteOne(request({params: {id: '5'}, query: {permanent: '1'}}), viaQuery)
      const viaBody = createResponse()
      controller.deleteOne(request({params: {id: '6'}, body: {permanent: true}}), viaBody)
      expect(mocks.hardDelete).toHaveBeenCalledTimes(2)
      expect(mocks.softDelete).not.toHaveBeenCalled()
      expect(viaQuery.body).toEqual({deletedIds: [5], softDeleted: false})
      expect(viaBody.body).toEqual({deletedIds: [6], softDeleted: false})
    })

    it('does not treat permanent=0 or other values as permanent', () => {
      const res = createResponse()
      controller.deleteOne(request({params: {id: '5'}, query: {permanent: '0'}}), res)
      expect(mocks.softDelete).toHaveBeenCalled()
      expect(mocks.hardDelete).not.toHaveBeenCalled()
    })
  })

  describe('trash', () => {
    it('lists the trash with count and retention, falling back to 200 rows for a bad limit', () => {
      mocks.listTrash.mockReturnValue([{id: 1}])
      mocks.countTrash.mockReturnValue(1)
      const res = createResponse()
      controller.listTrash(request({query: {limit: 'abc'}}), res)
      expect(mocks.listTrash).toHaveBeenCalledWith(expect.anything(), 200)
      expect(res.body).toEqual({items: [{id: 1}], count: 1, retentionDays: 30})
      controller.listTrash(request({query: {limit: '25'}}), createResponse())
      expect(mocks.listTrash).toHaveBeenLastCalledWith(expect.anything(), 25)
    })

    it('restores only valid positive ids', () => {
      mocks.restoreTrash.mockReturnValue([1, 3])
      const res = createResponse()
      controller.restoreTrash(request({body: {ids: [1, '3', 0, -2, 'x']}}), res)
      expect(mocks.restoreTrash).toHaveBeenCalledWith(expect.anything(), [1, 3])
      expect(res.body).toEqual({restoredIds: [1, 3]})
      expect(mocks.invalidate).toHaveBeenCalled()
    })

    it('purges the trashed filters that match the requested ids', () => {
      mocks.getTrashedForPurge.mockReturnValue([{id: 1}, {id: 3}])
      const res = createResponse()
      controller.purgeTrash(request({body: {ids: [1, 3, 'bad']}}), res)
      expect(mocks.getTrashedForPurge).toHaveBeenCalledWith(expect.anything(), [1, 3])
      expect(mocks.hardDelete).toHaveBeenCalledTimes(2)
      expect(res.body).toEqual({deletedIds: [1, 3]})
    })

    it('purges expired trash by looking up the expired ids first', () => {
      mocks.listExpiredIds.mockReturnValue([8, 9])
      mocks.getTrashedForPurge.mockReturnValue([{id: 8}, {id: 9}])
      const res = createResponse()
      controller.purgeExpiredTrash(request(), res)
      expect(mocks.getTrashedForPurge).toHaveBeenCalledWith(expect.anything(), [8, 9])
      expect(res.body).toEqual({deletedIds: [8, 9]})
    })

    it('tolerates an empty body when restoring or purging', () => {
      mocks.restoreTrash.mockReturnValue([])
      mocks.getTrashedForPurge.mockReturnValue([])
      const restored = createResponse()
      controller.restoreTrash(request(), restored)
      expect(restored.body).toEqual({restoredIds: []})
      const purged = createResponse()
      controller.purgeTrash(request(), purged)
      expect(purged.body).toEqual({deletedIds: []})
    })
  })

  describe('hydrated and playlist endpoints', () => {
    it('returns hydrated filters and creates-or-finds a hydrated one', async () => {
      mocks.getSavedFiltersHydrated.mockResolvedValue([{id: 1}])
      mocks.findOrCreateSavedFilterHydrated.mockResolvedValue({savedFilter: {id: 2}, created: true})
      const list = createResponse()
      await controller.findAllHydrated(request({body: {mediaTypeId: 1}}), list)
      expect(mocks.getSavedFiltersHydrated).toHaveBeenCalledWith(expect.anything(), {mediaTypeId: 1})
      expect(list.body).toEqual([{id: 1}])
      const created = createResponse()
      await controller.findOrCreateHydrated(request({body: {name: 'N', tagId: 4}}), created)
      expect(mocks.findOrCreateSavedFilterHydrated).toHaveBeenCalledWith(expect.anything(), {name: 'N', mediaTypeId: null, metaId: null, tagId: 4, tabId: null})
      expect(created.statusCode).toBe(201)
      expect(created.body).toEqual([{id: 2}, true])
    })

    it('returns dynamic playlist catalogues', async () => {
      mocks.getDynamicPlaylistsBasic.mockResolvedValue([{id: 1}])
      mocks.getDynamicPlaylistsSummary.mockResolvedValue([{id: 1, count: 4}])
      const basic = createResponse()
      await controller.dynamicPlaylistsBasic(request(), basic)
      const summary = createResponse()
      await controller.dynamicPlaylistsSummary(request(), summary)
      expect(basic.body).toEqual([{id: 1}])
      expect(summary.body).toEqual([{id: 1, count: 4}])
    })

    it('normalises the playlist summary', async () => {
      mocks.getSavedFilterPlaylistSummary.mockResolvedValue({count: '12', previewIds: undefined})
      const res = createResponse()
      await controller.getPlaylistSummary(request({params: {id: '3'}}), res)
      expect(mocks.getSavedFilterPlaylistSummary).toHaveBeenCalledWith(expect.anything(), 3)
      expect(res.body).toEqual({count: 12, previewIds: []})
    })

    it('loads playlist media for browsing, or for playback in either playback mode', async () => {
      mocks.getFilteredMediaForSavedFilter.mockResolvedValue({items: [{id: 1}], count: 1})
      mocks.getFilteredMediaForPlayback.mockResolvedValue({items: [{id: 2}], count: 1})
      const browse = createResponse()
      await controller.getPlaylistMedia(request({params: {id: '3'}}), browse)
      expect(browse.body).toEqual({items: [{id: 1}], count: 1})
      const byMode = createResponse()
      await controller.getPlaylistMedia(request({params: {id: '3'}, query: {mode: 'play'}}), byMode)
      const byFlag = createResponse()
      await controller.getPlaylistMedia(request({params: {id: '3'}, query: {playback: '1'}}), byFlag)
      expect(byMode.body).toEqual({items: [{id: 2}], count: 1})
      expect(byFlag.body).toEqual({items: [{id: 2}], count: 1})
      expect(mocks.getFilteredMediaForPlayback).toHaveBeenCalledTimes(2)
    })

    it('reports an error instead of throwing when a service fails', async () => {
      mocks.getSavedFiltersHydrated.mockRejectedValue(new Error('boom'))
      const res = createResponse()
      await controller.findAllHydrated(request(), res)
      expect(res.statusCode).toBeGreaterThanOrEqual(400)
    })
  })
})
