import type { ApiDb } from '../types/db'
import { sendControllerError, sendOk } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'
import { getHomeMedia } from '../services/homeMedia'
import { getRandomMarks } from '../services/homeMarkers'
import { getHomeHealth, getHomeHealthLite } from '../services/homeHealth'
import { getHomeExtendedStats } from '../services/homeExtendedStats'
import { getHomeChartStats } from '../services/homeChartStats'
import { getHomeSimilar } from '../services/homeSimilar'
import { getHomeTagSpotlight } from '../services/homeTagSpotlight'
import { getCreatedCalendarMonth } from '../services/homeCreatedCalendar'
import { searchMediaByName, searchTagsByName, searchGlobal } from '../services/globalSearch'
import { parseClampedLimit, parseOptionalInt } from '../utils/parseRequestNumber'

function parseHomeMediaLimit(value: unknown, fallbackWhenMissing: number, max = 24): number {
  if (value === undefined || value === null || value === '') return fallbackWhenMissing
  const parsed = parseOptionalInt(value)
  if (parsed == null || parsed <= 0) return 0
  return Math.min(Math.max(Math.round(parsed), 1), max)
}

/** Home media sections: 0 skips the section; otherwise clamp 1..24. */
function parseHomeSectionLimit(value: unknown, fallback: number): number {
  if (value == null || value === '') return fallback
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return fallback
  if (n === 0) return 0
  return Math.min(Math.max(Math.floor(n), 1), 24)
}

export default (db: ApiDb) => {
  const getMedia = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const sharedFallback = req.query.limit
      const limits = {
        continue: parseHomeSectionLimit(req.query.continueLimit ?? sharedFallback, 12),
        favorites: parseHomeSectionLimit(req.query.favoritesLimit ?? sharedFallback, 12),
        topViews: parseHomeSectionLimit(req.query.topViewsLimit ?? sharedFallback, 12),
        inbox: parseHomeMediaLimit(req.query.inboxLimit, 0, 500),
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
      const excludeSeedId = parseOptionalInt(req.query.excludeSeedId)
      const data = await getHomeSimilar(db, {
        limit,
        ...(excludeSeedId && excludeSeedId > 0 ? {excludeSeedId} : {}),
      })
      sendOk(res, data)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while retrieving home similar media.')
    }
  }

  const getTagSpotlight = function (req: ApiRequest, res: ApiResponse) {
    try {
      const excludeRaw = req.query?.excludeTagId
      const excludeTagId = excludeRaw == null || excludeRaw === ''
        ? null
        : Number(excludeRaw)
      const data = getHomeTagSpotlight(db, {
        excludeTagId: Number.isFinite(excludeTagId) && excludeTagId! > 0 ? excludeTagId : null,
      })
      sendOk(res, data)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while retrieving tag spotlight.')
    }
  }

  const getCreatedCalendar = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const now = new Date()
      const year = req.query?.year == null || req.query?.year === ''
        ? now.getFullYear()
        : Number(req.query.year)
      const month = req.query?.month == null || req.query?.month === ''
        ? now.getMonth() + 1
        : Number(req.query.month)
      const data = getCreatedCalendarMonth(db, year, month)
      sendOk(res, data)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while retrieving created-at calendar.')
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
    getTagSpotlight,
    getCreatedCalendar,
    searchMedia,
    searchTags,
    searchGlobal: searchGlobalHandler,
  }
}
