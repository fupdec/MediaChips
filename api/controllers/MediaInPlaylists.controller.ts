import type { ApiDb } from '../types/db'
import { sendControllerError, sendCreated, sendOk } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'

import { createMediaInPlaylistsRepository } from '../db/repositories/mediaInPlaylists'
export default function (db: ApiDb) {
  const mediaInPlaylistsRepo = createMediaInPlaylistsRepository(db.drizzle)

  const findAll = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = mediaInPlaylistsRepo.findByPlaylistId(Number(req.params.id))
      sendOk(res, data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const create = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = mediaInPlaylistsRepo.findOrCreate(req.body)
      sendCreated(res, [data.row, data.created])
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const update = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = req.body
      for (const item of data) {
        mediaInPlaylistsRepo.updateByKeys(Number(item.mediaId), Number(item.playlistId), item)
      }
      sendOk(res)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const deleteOne = function (req: ApiRequest, res: ApiResponse) {
    try {
      mediaInPlaylistsRepo.deleteByKeys(Number(req.body.mediaId), Number(req.body.playlistId))
      sendOk(res)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  return {
    findAll,
    create,
    update,
    deleteOne,
  }
}
