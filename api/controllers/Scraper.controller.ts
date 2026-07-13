import type { ApiDb } from '../types/db'
import { apiErrorMessage } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'
import { getRequestBody } from '../types/http'
import { createMediaRepository } from '../db/repositories/media'
import { computeOshashForPath } from '../services/oshash'
import {
  findTpdbScenesByOshash,
  fetchTpdbSceneMarkers,
  isTpdbConfigured,
  searchTpdbScenes,
} from '../services/theporndbApi'
import { applyTpdbSceneMarkersToMedia } from '../services/sceneScraperMarkers'

interface SceneSearchRequestBody {
  query?: string
  limit?: number
}

interface SceneMatchRequestBody {
  mediaId?: number | string
  query?: string
  limit?: number
}

interface SceneMarkersRequestBody {
  sceneId?: string
}

interface SceneMarkersApplyRequestBody {
  sceneId?: string
  mediaId?: number | string
  merge?: 'merge' | 'replace'
  markerMetaId?: number | string | null
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

  const getSceneMarkers = async function (req: ApiRequest, res: ApiResponse) {
    try {
      if (!isTpdbConfigured()) {
        res.status(503).send({
          message: 'ThePornDB API key is not configured. Set TPDB_API_KEY in the environment.',
        })
        return
      }

      const body = getRequestBody<SceneMarkersRequestBody>(req)
      const sceneId = String(body.sceneId || '').trim()

      if (!sceneId) {
        res.status(400).send({message: 'sceneId is required'})
        return
      }

      const markers = await fetchTpdbSceneMarkers(sceneId)
      res.status(200).send({ data: markers })
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || 'Failed to fetch scene markers from ThePornDB.',
      })
    }
  }

  const applySceneMarkers = async function (req: ApiRequest, res: ApiResponse) {
    try {
      if (!isTpdbConfigured()) {
        res.status(503).send({
          message: 'ThePornDB API key is not configured. Set TPDB_API_KEY in the environment.',
        })
        return
      }

      const body = getRequestBody<SceneMarkersApplyRequestBody>(req)
      const sceneId = String(body.sceneId || '').trim()
      const mediaId = Number(body.mediaId)
      const merge = body.merge === 'replace' ? 'replace' : 'merge'

      if (!sceneId) {
        res.status(400).send({message: 'sceneId is required'})
        return
      }

      if (!Number.isFinite(mediaId) || mediaId <= 0) {
        res.status(400).send({message: 'mediaId is required'})
        return
      }

      const markerMetaIdRaw = body.markerMetaId
      let markerMetaId: number | null = null
      if (markerMetaIdRaw != null && markerMetaIdRaw !== '') {
        const id = Number(markerMetaIdRaw)
        if (Number.isFinite(id) && id > 0) {
          markerMetaId = id
        }
      }

      const result = await applyTpdbSceneMarkersToMedia({
        db,
        sceneId,
        mediaId,
        merge,
        markerMetaId,
      })

      res.status(200).send(result)
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || 'Failed to import scene markers.',
      })
    }
  }

  return {
    searchScenes,
    matchScenes,
    status,
    getSceneMarkers,
    applySceneMarkers,
  }
}
