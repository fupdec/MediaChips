import type { ApiDb } from '../types/db'
import { sendBadRequest, sendControllerError, sendCreated, sendNotFound, sendOk } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'
import { createMarksRepository } from '../db/repositories/marks'
import { getMarkFilterMetas, loadMarkItems } from '../services/markItemsLoader'
import { resolveMarkChaptersForPath } from '../services/markChaptersForPath'
import { deleteMarkGeneratedAsset } from '../services/localAssetCleanup'
import {
  countTrashMarks,
  ENTITY_TRASH_RETENTION_DAYS,
  getTrashedMarksForPurge,
  listExpiredMarkIds,
  listTrashMarks,
  restoreTrashMarks,
  softDeleteMark,
} from '../services/entityTrash'
import { getRequestBody } from '../types/http'

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

      const sort = req.body?.sort === 'shuffle'
        ? 'shuffle'
        : req.body?.sort === 'selection'
          ? 'selection'
          : 'time'
      const limitRaw = Number(req.body?.limit)
      const offsetRaw = Number(req.body?.offset)
      const options = {
        sort: sort as 'time' | 'shuffle' | 'selection',
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

  const updateOne = function (req: ApiRequest, res: ApiResponse) {
    try {
      const markId = Number(req.params.id)
      if (!Number.isFinite(markId) || markId <= 0) {
        sendBadRequest(res, 'Invalid mark id')
        return
      }

      const existing = marksRepo.findById(markId)
      if (!existing) {
        sendNotFound(res, 'Mark not found')
        return
      }

      const body = (req.body || {}) as Partial<{
        type: string | null
        text: string | null
        icon: string | null
        time: number | null
        end: number | null
        tagId: number | null
        mediaId: number | null
      }>

      const nextTime = body.time !== undefined ? body.time : existing.time
      const updated = marksRepo.updateById(markId, {
        type: body.type !== undefined ? body.type : existing.type,
        text: body.text !== undefined ? body.text : existing.text,
        icon: body.icon !== undefined ? body.icon : existing.icon,
        time: nextTime,
        end: body.end !== undefined ? body.end : existing.end,
        tagId: body.tagId !== undefined ? body.tagId : existing.tagId,
        mediaId: body.mediaId !== undefined ? body.mediaId : existing.mediaId,
      })

      if (
        body.time !== undefined
        && Number(body.time) !== Number(existing.time)
      ) {
        deleteMarkGeneratedAsset(getDbPath(), markId)
      }

      sendOk(res, updated)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const deleteOne = function (req: ApiRequest, res: ApiResponse) {
    const markId = Number(req.params.id)
    const permanent = String((req.query as {permanent?: string} | undefined)?.permanent || '') === '1'
      || Boolean((req.body as {permanent?: boolean} | undefined)?.permanent)

    try {
      if (!permanent) {
        softDeleteMark(db, markId)
        return sendOk(res, {deletedIds: [markId], softDeleted: true})
      }

      deleteMarkGeneratedAsset(getDbPath(), markId)
      marksRepo.deleteById(markId)
      sendOk(res, {deletedIds: [markId], softDeleted: false})
    } catch (err) {
      sendControllerError(res, err, "Some error occurred while performing query.")
    }
  }

  const listTrash = function (req: ApiRequest, res: ApiResponse) {
    try {
      const limitRaw = (req.query as {limit?: string | number} | undefined)?.limit
      const limit = Number(limitRaw)
      sendOk(res, {
        items: listTrashMarks(db, Number.isFinite(limit) ? limit : 200),
        count: countTrashMarks(db),
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
      sendOk(res, {restoredIds: restoreTrashMarks(db, ids)})
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while restoring trash.')
    }
  }

  const purgeTrash = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<{ids?: Array<number | string>}>(req)
      const ids = (body.ids || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
      const targets = getTrashedMarksForPurge(db, ids)
      const deletedIds: number[] = []
      for (const target of targets) {
        deleteMarkGeneratedAsset(getDbPath(), target.id)
        marksRepo.deleteById(target.id)
        deletedIds.push(target.id)
      }
      sendOk(res, {deletedIds})
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while purging trash.')
    }
  }

  const purgeExpiredTrash = function (_req: ApiRequest, res: ApiResponse) {
    try {
      const ids = listExpiredMarkIds(db)
      const targets = getTrashedMarksForPurge(db, ids)
      const deletedIds: number[] = []
      for (const target of targets) {
        deleteMarkGeneratedAsset(getDbPath(), target.id)
        marksRepo.deleteById(target.id)
        deletedIds.push(target.id)
      }
      sendOk(res, {deletedIds})
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while purging expired trash.')
    }
  }

  return {
    create,
    updateOne,
    getClips,
    findAllForVideo,
    findChaptersByPath,
    findAll,
    getItems,
    getFilterMetas,
    deleteOne,
    listTrash,
    restoreTrash,
    purgeTrash,
    purgeExpiredTrash,
  }
}
