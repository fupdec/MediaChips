import type { ApiDb } from '../types/db'
import { sendControllerError, sendCreated, sendOk, paramString } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'
import type { ParsedDynamicPlaylistSummary } from '@shared/schemas/filters'

import { createPlaylistsRepository } from '../db/repositories/playlists'
import { getManualPlaylistsSummary } from '../services/playlistSummary'

export default function (db: ApiDb) {
  const playlistsRepo = createPlaylistsRepository(db.drizzle)

  const create = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = playlistsRepo.create(req.body)
      sendCreated(res, data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  /** Catalog bootstrap: id/name only. Membership via /summary or MediaInPlaylists. */
  const findAll = function (req: ApiRequest, res: ApiResponse) {
    try {
      sendOk(res, playlistsRepo.findAll())
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while retrieving media.')
    }
  }

  const findSummary = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const data: ParsedDynamicPlaylistSummary[] = await getManualPlaylistsSummary(db)
      sendOk(res, data)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while retrieving playlists.')
    }
  }

  const update = function (req: ApiRequest, res: ApiResponse) {
    try {
      playlistsRepo.updateById(parseInt(paramString(req.params.id), 10), req.body)
      sendOk(res)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while retrieving media.')
    }
  }

  const deleteOne = function (req: ApiRequest, res: ApiResponse) {
    try {
      playlistsRepo.deleteById(parseInt(paramString(req.params.id), 10))
      sendOk(res)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  return {
    create,
    findAll,
    findSummary,
    update,
    deleteOne,
  }
}
