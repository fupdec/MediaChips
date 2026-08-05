import type { ApiDb } from '../types/db'
import { sendControllerError } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'
import { getHomeMedia } from '../services/homeMedia'
import { getRandomMarks } from '../services/homeMarkers'
import { getHomeHealth, getHomeHealthLite } from '../services/homeHealth'
import { getHomeExtendedStats } from '../services/homeExtendedStats'
import { searchMediaByName, searchTagsByName, searchGlobal } from '../services/globalSearch'

function parseLimit(value: unknown, fallback: number, max = 24) {
  return Math.min(Math.max(Number(value) || fallback, 1), max)
}

export default (db: ApiDb) => {
  const getMedia = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const limits = {
        continue: parseLimit(req.query.continueLimit ?? req.query.limit, 12),
        favorites: parseLimit(req.query.favoritesLimit ?? req.query.limit, 12),
        topViews: parseLimit(req.query.topViewsLimit ?? req.query.limit, 12),
      }
      const data = await getHomeMedia(db, limits)
      res.status(200).send(data)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while retrieving home media.')
    }
  }

  const getMarkers = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const limit = parseLimit(req.query.limit, 8, 16)
      const marks = await getRandomMarks(db, limit)
      res.status(200).send({marks})
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while retrieving home markers.')
    }
  }

  const getHealth = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = await getHomeHealth(db)
      res.status(200).send(data)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while retrieving home health.')
    }
  }

  const getHealthLite = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = await getHomeHealthLite(db)
      res.status(200).send(data)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while retrieving lite home health.')
    }
  }

  const getExtendedStats = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = await getHomeExtendedStats(db)
      res.status(200).send(data)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while retrieving extended stats.')
    }
  }

  const searchMedia = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const q = req.body?.q ?? req.body?.query
      const items = await searchMediaByName(db, String(q || ''), req.body?.limit)
      res.status(200).send({items})
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while searching media.')
    }
  }

  const searchTags = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const q = req.body?.q ?? req.body?.query
      const metaId = req.body?.metaId
      const items = await searchTagsByName(db, String(q || ''), {
        limit: req.body?.limit,
        metaId: metaId == null || metaId === '' ? null : Number(metaId),
      })
      res.status(200).send({items})
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while searching tags.')
    }
  }

  const searchGlobalHandler = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const q = req.body?.q ?? req.body?.query
      const data = await searchGlobal(db, String(q || ''), {
        limit: req.body?.limit,
        tagIds: req.body?.tagIds,
      })
      res.status(200).send(data)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while searching.')
    }
  }

  return {
    getMedia,
    getMarkers,
    getHealth,
    getHealthLite,
    getExtendedStats,
    searchMedia,
    searchTags,
    searchGlobal: searchGlobalHandler,
  }
}
