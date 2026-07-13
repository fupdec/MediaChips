import type { ApiDb } from '../types/db'
import { apiErrorMessage } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'
import { getRequestBody } from '../types/http'
import { createMediaRepository } from '../db/repositories/media'
import { computeOshashForPath } from '../services/oshash'
import {
  findTpdbScenesByOshash,
  isTpdbConfigured,
  searchTpdbScenes,
} from '../services/theporndbApi'

interface SceneSearchRequestBody {
  query?: string
  limit?: number
}

interface SceneMatchRequestBody {
  mediaId?: number | string
  query?: string
  limit?: number
}

function parseLimit(value: unknown, fallback = 24): number {
  const limit = value == null ? fallback : Number(value)
  if (!Number.isFinite(limit)) return fallback
  return Math.min(Math.max(limit, 1), 50)
}

async function resolveMediaOshash(
  db: ApiDb,
  media: {id: unknown; path?: unknown; oshash?: unknown},
): Promise<string | null> {
  const existing = String(media.oshash || '').trim()
  if (existing) return existing

  const mediaPath = String(media.path || '')
  if (!mediaPath) return null

  try {
    const oshash = await computeOshashForPath(mediaPath)
    createMediaRepository(db.drizzle).updateById(Number(media.id), {oshash})
    return oshash
  } catch {
    return null
  }
}

export default function (db: ApiDb) {
  const mediaRepo = createMediaRepository(db.drizzle)

  const searchScenes = async function (req: ApiRequest, res: ApiResponse) {
    try {
      if (!isTpdbConfigured()) {
        res.status(503).send({
          message: 'ThePornDB API key is not configured. Set TPDB_API_KEY in the environment.',
        })
        return
      }

      const body = getRequestBody<SceneSearchRequestBody>(req)
      const query = String(body.query || '').trim()

      if (!query) {
        res.status(400).send({message: 'query is required'})
        return
      }

      const scenes = await searchTpdbScenes(query, {
        limit: parseLimit(body.limit),
      })

      res.status(200).send({
        matchMethod: 'search',
        data: scenes,
      })
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || 'Failed to search scenes on ThePornDB.',
      })
    }
  }

  const matchScenes = async function (req: ApiRequest, res: ApiResponse) {
    try {
      if (!isTpdbConfigured()) {
        res.status(503).send({
          message: 'ThePornDB API key is not configured. Set TPDB_API_KEY in the environment.',
        })
        return
      }

      const body = getRequestBody<SceneMatchRequestBody>(req)
      const mediaId = Number(body.mediaId)
      const query = String(body.query || '').trim()
      const limit = parseLimit(body.limit)

      if (!Number.isFinite(mediaId) || mediaId <= 0) {
        res.status(400).send({message: 'mediaId is required'})
        return
      }

      const media = mediaRepo.findById(mediaId)
      if (!media) {
        res.status(404).send({message: 'Media not found'})
        return
      }

      const oshash = await resolveMediaOshash(db, media)
      let scenes = oshash ? await findTpdbScenesByOshash(oshash) : []
      let matchMethod: 'oshash' | 'search' = scenes.length ? 'oshash' : 'search'

      if (!scenes.length && query) {
        scenes = await searchTpdbScenes(query, {limit})
        matchMethod = 'search'
      }

      res.status(200).send({
        matchMethod,
        oshash,
        data: scenes.slice(0, limit),
      })
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || 'Failed to match scenes on ThePornDB.',
      })
    }
  }

  const status = function (_req: ApiRequest, res: ApiResponse) {
    res.status(200).send({
      configured: isTpdbConfigured(),
    })
  }

  return {
    searchScenes,
    matchScenes,
    status,
  }
}
