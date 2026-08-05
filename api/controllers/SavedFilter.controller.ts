import type { ApiDb } from '../types/db'
import { sendControllerError, paramString } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'
import type { SavedFilterMediaResponse, SavedFilterSummaryResponse } from '@shared/api/responses'

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
      }

      const result = payload.name
        ? [savedFiltersRepo.create(payload), true]
        : (() => {
          const {row, created} = savedFiltersRepo.findOrCreate(payload)
          return [row, created]
        })()

      res.status(201).send(result)
      invalidateMediaDerivedCaches()
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const findOne = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = savedFiltersRepo.findById(Number(req.params.id)) ?? null
      res.status(201).send(data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const findAll = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = savedFiltersRepo.findAllNamed(req.body || {})
      res.status(201).send(data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const update = function (req: ApiRequest, res: ApiResponse) {
    try {
      savedFiltersRepo.updateById(Number(req.params.id), req.body)
      invalidateMediaDerivedCaches()
      res.sendStatus(201)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const deleteOne = function (req: ApiRequest, res: ApiResponse) {
    try {
      savedFiltersRepo.deleteById(Number(req.params.id))
      invalidateMediaDerivedCaches()
      res.sendStatus(201)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const findAllHydrated = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = await getSavedFiltersHydrated(db, req.body || {})
      res.status(201).send(data)
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
      res.status(201).send([savedFilter, created])
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const dynamicPlaylistsBasic = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = await getDynamicPlaylistsBasic(db)
      res.status(201).send(data)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while retrieving dynamic playlists.')
    }
  }

  const dynamicPlaylistsSummary = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = await getDynamicPlaylistsSummary(db)
      res.status(201).send(data)
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
      res.status(201).send(payload)
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
      res.status(201).send(payload)
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
    dynamicPlaylistsBasic,
    dynamicPlaylistsSummary,
    getPlaylistSummary,
    getPlaylistMedia,
  }
}
