import shuffle from 'lodash/shuffle'
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
      const tagId = Number(req.body?.tagId)
      if (!Number.isFinite(tagId) || tagId <= 0) {
        sendBadRequest(res, 'tagId is required')
        return
      }

      const countOnly = Boolean(req.body?.countOnly)
      if (countOnly) {
        sendOk(res, {
          items: [],
          count: marksRepo.countClipsByTagId(tagId),
        })
        return
      }

      let items = marksRepo.findClipsByTagId(tagId)
      if (req.body?.sort === 'shuffle') {
        items = shuffle(items)
      }

      sendOk(res, {
        items,
        count: items.length,
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
