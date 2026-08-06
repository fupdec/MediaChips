import type { ApiDb } from '../types/db'
import { sendControllerError, sendCreated, sendOk } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'
import { createFolderPathsRepository } from '../db/repositories/folderPaths'
import { createTagsInFoldersRepository } from '../db/repositories/tagsInFolders'
import { invalidateMediaDerivedCaches } from '../services/mediaCacheInvalidation'

export default function (db: ApiDb) {
  const tagsInFoldersRepo = createTagsInFoldersRepository(db.drizzle)
  const folderPathsRepo = createFolderPathsRepository(db.drizzle)

  const bulkCreate = function (req: ApiRequest, res: ApiResponse) {
    try {
      const items = Array.isArray(req.body) ? req.body : []
      const data = tagsInFoldersRepo.bulkCreate(items.map((item: {
        path?: string
        tagId?: number
        metaId?: number
      }) => ({
        path: String(item.path ?? ''),
        tagId: Number(item.tagId),
        metaId: Number(item.metaId),
      })))
      invalidateMediaDerivedCaches()
      sendCreated(res, data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const create = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = tagsInFoldersRepo.findOrCreate({
        path: String(req.body.path ?? ''),
        tagId: Number(req.body.tagId),
        metaId: Number(req.body.metaId),
      })
      invalidateMediaDerivedCaches()
      sendCreated(res, data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const findAll = function (req: ApiRequest, res: ApiResponse) {
    try {
      const path = String(req.query.path ?? '')
      const data = tagsInFoldersRepo.findAllByPath(path)
      sendOk(res, data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const findByPaths = function (req: ApiRequest, res: ApiResponse) {
    try {
      const paths = Array.isArray(req.body?.paths) ? req.body.paths.map(String) : []
      const data = tagsInFoldersRepo.findAllByPaths(paths)
      sendOk(res, data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const listAll = function (_req: ApiRequest, res: ApiResponse) {
    try {
      const data = tagsInFoldersRepo.findAllWithTags()
      sendOk(res, data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const clearAll = function (req: ApiRequest, res: ApiResponse) {
    try {
      const cleared = tagsInFoldersRepo.clearAllByPath(String(req.body.path ?? ''))
      invalidateMediaDerivedCaches()
      sendOk(res, {cleared})
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const deleteFromFolder = function (req: ApiRequest, res: ApiResponse) {
    try {
      tagsInFoldersRepo.deleteOne(String(req.body.path ?? ''), Number(req.body.tagId))
      invalidateMediaDerivedCaches()
      sendOk(res)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const deleteAllTagsByMetaId = function (req: ApiRequest, res: ApiResponse) {
    try {
      tagsInFoldersRepo.deleteByPathAndMeta(String(req.body.path ?? ''), Number(req.body.metaId))
      invalidateMediaDerivedCaches()
      sendOk(res)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const replaceForMeta = function (req: ApiRequest, res: ApiResponse) {
    try {
      const tagIds = Array.isArray(req.body.tagIds) ? req.body.tagIds.map(Number) : []
      const data = tagsInFoldersRepo.replaceForPathAndMeta(
        String(req.body.path ?? ''),
        Number(req.body.metaId),
        tagIds,
      )
      invalidateMediaDerivedCaches()
      sendOk(res, data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const remapPaths = function (req: ApiRequest, res: ApiResponse) {
    try {
      const find = String(req.body.find ?? '')
      const replace = String(req.body.replace ?? '')
      const changed = folderPathsRepo.remapPathFragment(find, replace)
      invalidateMediaDerivedCaches()
      sendOk(res, {changed})
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  return {
    bulkCreate,
    create,
    findAll,
    findByPaths,
    listAll,
    clearAll,
    deleteFromFolder,
    deleteAllTagsByMetaId,
    replaceForMeta,
    remapPaths,
  }
}
