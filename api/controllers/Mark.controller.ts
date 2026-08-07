import type { ApiDb } from '../types/db'
import { sendBadRequest, sendControllerError, sendCreated, sendOk } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'
import { createMarksRepository } from '../db/repositories/marks'
import { getMarkFilterMetas, loadMarkItems } from '../services/markItemsLoader'
import { resolveMarkChaptersForPath } from '../services/markChaptersForPath'
import { deleteMarkGeneratedAsset } from '../services/localAssetCleanup'

export default function (db: ApiDb) {
  const marksRepo = createMarksRepository(db.drizzle)
  const getDbPath = () => db.path!

  const create = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = marksRepo.create(req.body)
      sendCreated(res, data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const getClips = function (req: ApiRequest, res: ApiResponse) {
    try {
      const markIds = Array.isArray(req.body?.markIds)
        ? req.body.markIds.map(Number).filter((id: number) => Number.isFinite(id) && id > 0)
        : []
      const tagId = Number(req.body?.tagId)
      const hasMarkIds = markIds.length > 0
      const hasTagId = Number.isFinite(tagId) && tagId > 0

      if (!hasMarkIds && !hasTagId) {
        sendBadRequest(res, 'tagId or markIds is required')
        return
      }

      const count = hasMarkIds
        ? marksRepo.countClipsByMarkIds(markIds)
        : marksRepo.countClipsByTagId(tagId)
      const countOnly = Boolean(req.body?.countOnly)
      if (countOnly) {
        sendOk(res, {
          items: [],
          count,
        })
        return
      }

      const sort = req.body?.sort === 'shuffle' ? 'shuffle' : 'time'
      const limitRaw = Number(req.body?.limit)
      const offsetRaw = Number(req.body?.offset)
      const options = {
        sort: sort as 'time' | 'shuffle',
        limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined,
        offset: Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : undefined,
      }
      const items = hasMarkIds
        ? marksRepo.findClipsByMarkIds(markIds, options)
        : marksRepo.findClipsByTagId(tagId, options)

      sendOk(res, {
        items,
        count,
      })
    } catch (err) {
      sendControllerError(res, err, "Some error occurred while performing query.")
    }
  };

  const findAllForVideo = function (req: ApiRequest, res: ApiResponse) {
    try {
      const marks = marksRepo.findAllForVideo(Number(req.params.id))
      sendOk(res, marks)
    } catch (err) {
      sendControllerError(res, err, "Some error occurred while performing query.")
    }
  };

  const findChaptersByPath = function (req: ApiRequest, res: ApiResponse) {
    try {
      const pathValue = String(req.body?.path || '').trim()
      if (!pathValue) {
        sendBadRequest(res, 'path is required')
        return
      }

      const result = resolveMarkChaptersForPath(db, pathValue)
      sendOk(res, result)
    } catch (err) {
      sendControllerError(res, err, "Some error occurred while performing query.")
    }
  };

  const findAll = function (req: ApiRequest, res: ApiResponse) {
    try {
      const marks = marksRepo.findAllWithRelations()
      sendOk(res, marks)
    } catch (err) {
      sendControllerError(res, err, "Some error occurred while performing query.")
    }
  };

  const getItems = function (req: ApiRequest, res: ApiResponse) {
    loadMarkItems(db, req.body || {})
      .then((data: unknown) => {
        sendOk(res, data)
      })
      .catch((err: unknown) => {
        sendControllerError(res, err, 'Some error occurred while performing query.')
      })
  }

  const getFilterMetas = function (req: ApiRequest, res: ApiResponse) {
    getMarkFilterMetas(db)
      .then((data: unknown) => {
        sendOk(res, data)
      })
      .catch((err: unknown) => {
        sendControllerError(res, err, 'Some error occurred while performing query.')
      })
  }

  const deleteOne = function (req: ApiRequest, res: ApiResponse) {
    const markId = req.params.id

    deleteMarkGeneratedAsset(getDbPath(), markId)

    try {
      marksRepo.deleteById(Number(markId))
      sendOk(res)
    } catch (err) {
      sendControllerError(res, err, "Some error occurred while performing query.")
    }
  };

  return {
    create,
    getClips,
    findAllForVideo,
    findChaptersByPath,
    findAll,
    getItems,
    getFilterMetas,
    deleteOne
  }
}
