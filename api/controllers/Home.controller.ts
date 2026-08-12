import type { ApiDb } from '../types/db'
import { sendControllerError, sendOk } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'
import { getHomeMedia } from '../services/homeMedia'
import { getRandomMarks } from '../services/homeMarkers'
import { getHomeHealth, getHomeHealthLite } from '../services/homeHealth'
import { getHomeExtendedStats } from '../services/homeExtendedStats'
import { getHomeChartStats } from '../services/homeChartStats'
import { getHomeSimilar } from '../services/homeSimilar'
import { searchMediaByName, searchTagsByName, searchGlobal } from '../services/globalSearch'
import { parseClampedLimit } from '../utils/parseRequestNumber'

export default (db: ApiDb) => {
  const getMedia = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const limits = {
        continue: parseClampedLimit(req.query.continueLimit ?? req.query.limit, 12),
        favorites: parseClampedLimit(req.query.favoritesLimit ?? req.query.limit, 12),
        topViews: parseClampedLimit(req.query.topViewsLimit ?? req.query.limit, 12),
      }
      const data = await getHomeMedia(db, limits)
      sendOk(res, data)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while retrieving home media.')
    }
  }

  const getMarkers = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const limit = parseClampedLimit(req.query.limit, 8, 16)
      const marks = await getRandomMarks(db, limit)
      sendOk(res, {marks})
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while retrieving home markers.')
    }
  }

  const getHealth = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = await getHomeHealth(db)
      sendOk(res, data)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while retrieving home health.')
    }
  }

  const getHealthLite = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = await getHomeHealthLite(db)
      sendOk(res, data)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while retrieving lite home health.')
    }
  }

  const getExtendedStats = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = await getHomeExtendedStats(db)
      sendOk(res, data)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while retrieving extended stats.')
    }
  }

  const getChartStats = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = await getHomeChartStats(db, req.query?.period)
      sendOk(res, data)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while retrieving chart stats.')
    }
  }

  const getSimilar = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const limit = parseClampedLimit(req.query.limit, 12)
      const data = await getHomeSimilar(db, {limit})
      sendOk(res, data)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while retrieving home similar media.')
    }
  }

  const searchMedia = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const q = req.body?.q ?? req.body?.query
      const items = await searchMediaByName(db, String(q || ''), req.body?.limit)
      sendOk(res, {items})
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
      sendOk(res, {items})
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
      sendOk(res, data)
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
    getChartStats,
    getSimilar,
    searchMedia,
    searchTags,
    searchGlobal: searchGlobalHandler,
  }
}
