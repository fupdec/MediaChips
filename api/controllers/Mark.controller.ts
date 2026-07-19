import shuffle from 'lodash/shuffle'
import type { ApiDb } from '../types/db'
import { apiErrorMessage } from '../types/errors'
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
      res.status(201).send(data)
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while performing query."
      })
    }
  };

  const getClips = function (req: ApiRequest, res: ApiResponse) {
    try {
      const tagId = Number(req.body?.tagId)
      if (!Number.isFinite(tagId) || tagId <= 0) {
        res.status(400).send({message: 'tagId is required'})
        return
      }

      const countOnly = Boolean(req.body?.countOnly)
      if (countOnly) {
        res.status(201).send({
          items: [],
          count: marksRepo.countClipsByTagId(tagId),
        })
        return
      }

      let items = marksRepo.findClipsByTagId(tagId)
      if (req.body?.sort === 'shuffle') {
        items = shuffle(items)
      }

      res.status(201).send({
        items,
        count: items.length,
      })
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while performing query."
      })
    }
  };

  const findAllForVideo = function (req: ApiRequest, res: ApiResponse) {
    try {
      const marks = marksRepo.findAllForVideo(Number(req.params.id))
      res.status(201).send(marks)
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while performing query."
      })
    }
  };

  const findChaptersByPath = function (req: ApiRequest, res: ApiResponse) {
    try {
      const pathValue = String(req.body?.path || '').trim()
      if (!pathValue) {
        res.status(400).send({message: 'path is required'})
        return
      }

      const result = resolveMarkChaptersForPath(db, pathValue)
      res.status(200).send(result)
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while performing query."
      })
    }
  };

  const findAll = function (req: ApiRequest, res: ApiResponse) {
    try {
      const marks = marksRepo.findAllWithRelations()
      res.status(201).send(marks)
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while performing query."
      })
    }
  };

  const getItems = function (req: ApiRequest, res: ApiResponse) {
    loadMarkItems(db, req.body || {})
      .then((data: unknown) => {
        res.status(201).send(data)
      })
      .catch((err: unknown) => {
        res.status(500).send({
          message: apiErrorMessage(err) || "Some error occurred while performing query."
        })
      })
  }

  const getFilterMetas = function (req: ApiRequest, res: ApiResponse) {
    getMarkFilterMetas(db)
      .then((data: unknown) => {
        res.status(201).send(data)
      })
      .catch((err: unknown) => {
        res.status(500).send({
          message: apiErrorMessage(err) || "Some error occurred while performing query."
        })
      })
  }

  const deleteOne = function (req: ApiRequest, res: ApiResponse) {
    const markId = req.params.id

    deleteMarkGeneratedAsset(getDbPath(), markId)

    try {
      marksRepo.deleteById(Number(markId))
      res.sendStatus(201)
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while performing query."
      })
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
