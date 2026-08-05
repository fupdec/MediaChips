import type { ApiDb } from '../types/db'
import { sendControllerError } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'

import { createMediaInPlaylistsRepository } from '../db/repositories/mediaInPlaylists'
export default function (db: ApiDb) {
  const mediaInPlaylistsRepo = createMediaInPlaylistsRepository(db.drizzle)

  const findAll = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = mediaInPlaylistsRepo.findByPlaylistId(Number(req.params.id))
      res.status(201).send(data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const create = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = mediaInPlaylistsRepo.findOrCreate(req.body)
      res.status(201).send([data.row, data.created])
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
      res.sendStatus(201)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const deleteOne = function (req: ApiRequest, res: ApiResponse) {
    try {
      mediaInPlaylistsRepo.deleteByKeys(Number(req.body.mediaId), Number(req.body.playlistId))
      res.sendStatus(201)
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
