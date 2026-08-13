import type { ApiDb } from '../types/db'
import { sendControllerError, sendCreated, sendOk, paramString } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'
import type { ParsedDynamicPlaylistSummary } from '@shared/schemas/filters'
import { getRequestBody } from '../types/http'

import { createPlaylistsRepository } from '../db/repositories/playlists'
import { getManualPlaylistsSummary } from '../services/playlistSummary'
import {
  countTrashPlaylists,
  ENTITY_TRASH_RETENTION_DAYS,
  getTrashedPlaylistsForPurge,
  hardDeletePlaylistCascade,
  listExpiredPlaylistIds,
  listTrashPlaylists,
  restoreTrashPlaylists,
  softDeletePlaylist,
} from '../services/entityTrash'

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
      const id = parseInt(paramString(req.params.id), 10)
      const permanent = String((req.query as {permanent?: string} | undefined)?.permanent || '') === '1'
        || Boolean((req.body as {permanent?: boolean} | undefined)?.permanent)

      if (!permanent) {
        softDeletePlaylist(db, id)
        return sendOk(res, {deletedIds: [id], softDeleted: true})
      }

      hardDeletePlaylistCascade(db, id)
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
        items: listTrashPlaylists(db, Number.isFinite(limit) ? limit : 200),
        count: countTrashPlaylists(db),
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
      sendOk(res, {restoredIds: restoreTrashPlaylists(db, ids)})
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while restoring trash.')
    }
  }

  const purgeTrash = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<{ids?: Array<number | string>}>(req)
      const ids = (body.ids || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
      const targets = getTrashedPlaylistsForPurge(db, ids)
      const deletedIds: number[] = []
      for (const target of targets) {
        hardDeletePlaylistCascade(db, target.id)
        deletedIds.push(target.id)
      }
      sendOk(res, {deletedIds})
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while purging trash.')
    }
  }

  const purgeExpiredTrash = function (_req: ApiRequest, res: ApiResponse) {
    try {
      const ids = listExpiredPlaylistIds(db)
      const targets = getTrashedPlaylistsForPurge(db, ids)
      const deletedIds: number[] = []
      for (const target of targets) {
        hardDeletePlaylistCascade(db, target.id)
        deletedIds.push(target.id)
      }
      sendOk(res, {deletedIds})
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while purging expired trash.')
    }
  }

  return {
    create,
    findAll,
    findSummary,
    update,
    deleteOne,
    listTrash,
    restoreTrash,
    purgeTrash,
    purgeExpiredTrash,
  }
}
