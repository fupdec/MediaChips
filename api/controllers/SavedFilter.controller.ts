import type { ApiDb } from '../types/db'
import { sendControllerError, sendCreated, sendOk, paramString } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'
import type { SavedFilterMediaResponse, SavedFilterSummaryResponse } from '@shared/api/responses'
import { getRequestBody } from '../types/http'

import { createSavedFiltersRepository } from '../db/repositories/savedFilters'
import {
  getDynamicPlaylistsBasic,
  getDynamicPlaylistsSummary,
  getSavedFilterPlaylistSummary,
  getSavedFiltersHydrated,
  findOrCreateSavedFilterHydrated,
  getFilteredMediaForPlayback,
  getFilteredMediaForSavedFilter,
} from '../services/savedFilterMedia'
import { invalidateMediaDerivedCaches } from '../services/mediaCacheInvalidation'
import {
  countTrashSavedFilters,
  ENTITY_TRASH_RETENTION_DAYS,
  getTrashedSavedFiltersForPurge,
  hardDeleteSavedFilterCascade,
  listExpiredSavedFilterIds,
  listTrashSavedFilters,
  restoreTrashSavedFilters,
  softDeleteSavedFilter,
} from '../services/entityTrash'

export default function (db: ApiDb) {
  const savedFiltersRepo = createSavedFiltersRepository(db.drizzle)

  const create = function (req: ApiRequest, res: ApiResponse) {
    try {
      const payload = {
        name: req.body.name ?? null,
        mediaTypeId: req.body.mediaTypeId ?? null,
        metaId: req.body.metaId ?? null,
        tagId: req.body.tagId ?? null,
        tabId: req.body.tabId ?? null,
        sortBy: req.body.sortBy ?? null,
        sortDir: req.body.sortDir ?? null,
        size: req.body.size ?? null,
        view: req.body.view ?? null,
        groupBy: req.body.groupBy ?? null,
        filtersJoin: req.body.filtersJoin ?? null,
        icon: req.body.icon ?? null,
      }

      const result = payload.name
        ? [savedFiltersRepo.create(payload), true]
        : (() => {
          const {row, created} = savedFiltersRepo.findOrCreate(payload)
          return [row, created]
        })()

      sendCreated(res, result)
      invalidateMediaDerivedCaches()
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const findOne = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = savedFiltersRepo.findById(Number(req.params.id)) ?? null
      sendOk(res, data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const findAll = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = savedFiltersRepo.findAllNamed(req.body || {})
      sendOk(res, data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const update = function (req: ApiRequest, res: ApiResponse) {
    try {
      savedFiltersRepo.updateById(Number(req.params.id), req.body)
      invalidateMediaDerivedCaches()
      sendOk(res)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const deleteOne = function (req: ApiRequest, res: ApiResponse) {
    try {
      const id = Number(req.params.id)
      const permanent = String((req.query as {permanent?: string} | undefined)?.permanent || '') === '1'
        || Boolean((req.body as {permanent?: boolean} | undefined)?.permanent)

      if (!permanent) {
        softDeleteSavedFilter(db, id)
        invalidateMediaDerivedCaches()
        return sendOk(res, {deletedIds: [id], softDeleted: true})
      }

      hardDeleteSavedFilterCascade(db, id)
      invalidateMediaDerivedCaches()
      sendOk(res, {deletedIds: [id], softDeleted: false})
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const listTrash = function (req: ApiRequest, res: ApiResponse) {
    try {
      const limitRaw = (req.query as {limit?: string | number} | undefined)?.limit
      const limit = Number(limitRaw)
      sendOk(res, {
        items: listTrashSavedFilters(db, Number.isFinite(limit) ? limit : 200),
        count: countTrashSavedFilters(db),
        retentionDays: ENTITY_TRASH_RETENTION_DAYS,
      })
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while listing trash.')
    }
  }

  const restoreTrash = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<{ids?: Array<number | string>}>(req)
      const ids = (body.ids || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
      const restoredIds = restoreTrashSavedFilters(db, ids)
      invalidateMediaDerivedCaches()
      sendOk(res, {restoredIds})
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while restoring trash.')
    }
  }

  const purgeTrash = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<{ids?: Array<number | string>}>(req)
      const ids = (body.ids || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
      const targets = getTrashedSavedFiltersForPurge(db, ids)
      const deletedIds: number[] = []
      for (const target of targets) {
        hardDeleteSavedFilterCascade(db, target.id)
        deletedIds.push(target.id)
      }
      invalidateMediaDerivedCaches()
      sendOk(res, {deletedIds})
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while purging trash.')
    }
  }

  const purgeExpiredTrash = function (_req: ApiRequest, res: ApiResponse) {
    try {
      const ids = listExpiredSavedFilterIds(db)
      const targets = getTrashedSavedFiltersForPurge(db, ids)
      const deletedIds: number[] = []
      for (const target of targets) {
        hardDeleteSavedFilterCascade(db, target.id)
        deletedIds.push(target.id)
      }
      invalidateMediaDerivedCaches()
      sendOk(res, {deletedIds})
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while purging expired trash.')
    }
  }

  const findAllHydrated = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = await getSavedFiltersHydrated(db, req.body || {})
      sendOk(res, data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const findOrCreateHydrated = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const payload = {
        name: req.body.name ?? null,
        mediaTypeId: req.body.mediaTypeId ?? null,
        metaId: req.body.metaId ?? null,
        tagId: req.body.tagId ?? null,
        tabId: req.body.tabId ?? null,
      }

      const { savedFilter, created } = await findOrCreateSavedFilterHydrated(db, payload)
      sendCreated(res, [savedFilter, created])
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const dynamicPlaylistsBasic = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = await getDynamicPlaylistsBasic(db)
      sendOk(res, data)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while retrieving dynamic playlists.')
    }
  }

  const dynamicPlaylistsSummary = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = await getDynamicPlaylistsSummary(db)
      sendOk(res, data)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while retrieving dynamic playlists.')
    }
  }

  const getPlaylistSummary = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = await getSavedFilterPlaylistSummary(db, parseInt(paramString(req.params.id), 10))
      const payload: SavedFilterSummaryResponse = {
        count: Number(data.count) || 0,
        previewIds: data.previewIds || [],
      }
      sendOk(res, payload)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while retrieving playlist summary.')
    }
  }

  const getPlaylistMedia = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const forPlayback = req.query.mode === 'play' || req.query.playback === '1'
      const result = forPlayback
        ? await getFilteredMediaForPlayback(db, parseInt(paramString(req.params.id), 10))
        : await getFilteredMediaForSavedFilter(db, parseInt(paramString(req.params.id), 10))
      const payload: SavedFilterMediaResponse = {
        items: result.items,
        count: result.count,
      }
      sendOk(res, payload)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while retrieving playlist media.')
    }
  }

  return {
    create,
    findOne,
    findAll,
    findAllHydrated,
    findOrCreateHydrated,
    update,
    deleteOne,
    listTrash,
    restoreTrash,
    purgeTrash,
    purgeExpiredTrash,
    dynamicPlaylistsBasic,
    dynamicPlaylistsSummary,
    getPlaylistSummary,
    getPlaylistMedia,
  }
}
