import fs from 'fs'
import path from 'path'
import type { ApiDb } from '../../../../api/types/db'
import { apiErrorMessage } from '../../../../api/types/errors'
import type { ApiRequest, ApiResponse } from '../../../../api/types/http'
import { getRequestBody } from '../../../../api/types/http'
import { createMediaRepository } from '../../../../api/db/repositories/media'
import { computeOshashForPath } from '../../../../api/services/oshash'
import { applyTpdbSceneMarkersToMedia } from '../../../../api/services/sceneScraperMarkers'
import {
  findTpdbScenesByOshash,
  fetchTpdbSceneMarkers,
  searchTpdbPerformers,
  searchTpdbScenes,
} from './theporndbApi'
import {
  getCamGirlFinderSimilar,
  searchCamGirlFinderByImage,
  searchCamGirlFinderByUrl,
  searchCamGirlFinderModels,
} from './camgirlfinderApi'
import {
  flattenSimilarPredictions,
  mapFaceSearchJobToPerformers,
  mapNameSearchAccountsToPerformers,
} from './camgirlfinderMap'
import {
  adultPluginDisabledMessage,
  isAdultPluginEnabled,
  isTpdbConfigured,
  resolveTpdbApiKey,
  tpdbKeyMissingMessage,
} from './tpdbApiKey'

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

interface CamGirlFinderSearchRequestBody {
  mode?: 'face' | 'name'
  query?: string
  cropPath?: string
  imageUrl?: string
  platform?: string
  gender?: string
  includeSimilar?: boolean
  limit?: number
}

function resolveSafeDbFilePath(dbPath: string, relativePath: string): string | null {
  const root = path.resolve(dbPath)
  const absolute = path.resolve(root, relativePath)
  const relative = path.relative(root, absolute)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return null
  }
  return absolute
}

function parseLimit(value: unknown, fallback = 24): number {
  const limit = value == null ? fallback : Number(value)
  if (!Number.isFinite(limit)) return fallback
  return Math.min(Math.max(limit, 1), 50)
}

function parsePage(value: unknown, fallback = 1): number {
  const page = value == null ? fallback : Number(value)
  if (!Number.isFinite(page)) return fallback
  return Math.max(1, Math.floor(page))
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

function rejectIfPluginDisabled(db: ApiDb, res: ApiResponse): boolean {
  if (isAdultPluginEnabled(db)) return false
  res.status(503).send({message: adultPluginDisabledMessage()})
  return true
}

function rejectIfKeyMissing(db: ApiDb, res: ApiResponse): boolean {
  if (isTpdbConfigured(db)) return false
  res.status(503).send({message: tpdbKeyMissingMessage()})
  return true
}

export default function (db: ApiDb) {
  const mediaRepo = createMediaRepository(db.drizzle)
  const tpdbCtx = {db}

  const searchPerformers = async function (req: ApiRequest, res: ApiResponse) {
    try {
      if (rejectIfPluginDisabled(db, res)) return
      if (rejectIfKeyMissing(db, res)) return

      const query = req.query || {}
      const q = String(query.q || '').trim()
      const gender = String(query.gender || '').trim()
      const page = parsePage(query.page)
      const perPage = parseLimit(query.per_page ?? query.perPage, 24)

      const payload = await searchTpdbPerformers({
        q: q || undefined,
        gender: gender || undefined,
        page,
        perPage,
      }, tpdbCtx)

      res.status(200).send(payload)
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || 'Failed to search performers on ThePornDB.',
      })
    }
  }

  const searchScenes = async function (req: ApiRequest, res: ApiResponse) {
    try {
      if (rejectIfPluginDisabled(db, res)) return
      if (rejectIfKeyMissing(db, res)) return

      const body = getRequestBody<SceneSearchRequestBody>(req)
      const query = String(body.query || '').trim()

      if (!query) {
        res.status(400).send({message: 'query is required'})
        return
      }

      const scenes = await searchTpdbScenes(query, {
        limit: parseLimit(body.limit),
      }, tpdbCtx)

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
      if (rejectIfPluginDisabled(db, res)) return
      if (rejectIfKeyMissing(db, res)) return

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
      let scenes = oshash ? await findTpdbScenesByOshash(oshash, tpdbCtx) : []
      let matchMethod: 'oshash' | 'search' = scenes.length ? 'oshash' : 'search'

      if (!scenes.length && query) {
        scenes = await searchTpdbScenes(query, {limit}, tpdbCtx)
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
    if (rejectIfPluginDisabled(db, res)) return

    const {source} = resolveTpdbApiKey(db)
    res.status(200).send({
      configured: Boolean(source),
      source,
    })
  }

  const getSceneMarkers = async function (req: ApiRequest, res: ApiResponse) {
    try {
      if (rejectIfPluginDisabled(db, res)) return
      if (rejectIfKeyMissing(db, res)) return

      const body = getRequestBody<SceneMarkersRequestBody>(req)
      const sceneId = String(body.sceneId || '').trim()

      if (!sceneId) {
        res.status(400).send({message: 'sceneId is required'})
        return
      }

      const markers = await fetchTpdbSceneMarkers(sceneId, tpdbCtx)
      res.status(200).send({ data: markers })
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || 'Failed to fetch scene markers from ThePornDB.',
      })
    }
  }

  const applySceneMarkers = async function (req: ApiRequest, res: ApiResponse) {
    try {
      if (rejectIfPluginDisabled(db, res)) return
      if (rejectIfKeyMissing(db, res)) return

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

  const searchCamGirlFinder = async function (req: ApiRequest, res: ApiResponse) {
    try {
      if (rejectIfPluginDisabled(db, res)) return

      const body = getRequestBody<CamGirlFinderSearchRequestBody>(req)
      const query = String(body.query || '').trim()
      const cropPath = String(body.cropPath || '').trim()
      const imageUrl = String(body.imageUrl || '').trim()
      const platform = String(body.platform || '').trim()
      const gender = String(body.gender || '').trim()
      const includeSimilar = body.includeSimilar !== false
      const limit = parseLimit(body.limit, 24)
      const mode = body.mode === 'name' || body.mode === 'face'
        ? body.mode
        : (cropPath || imageUrl ? 'face' : 'name')

      if (mode === 'face') {
        if (!cropPath && !imageUrl) {
          res.status(400).send({message: 'cropPath or imageUrl is required for face search'})
          return
        }

        let job
        if (cropPath) {
          const dbPath = String(db.path || '').trim()
          if (!dbPath) {
            res.status(500).send({message: 'Database path is unavailable'})
            return
          }

          const absoluteCrop = resolveSafeDbFilePath(dbPath, cropPath)
          if (!absoluteCrop) {
            res.status(400).send({message: 'Invalid cropPath'})
            return
          }
          if (!fs.existsSync(absoluteCrop)) {
            res.status(404).send({message: 'Face crop not found'})
            return
          }

          const image = fs.readFileSync(absoluteCrop)
          job = await searchCamGirlFinderByImage(image, path.basename(absoluteCrop))
        } else {
          job = await searchCamGirlFinderByUrl(imageUrl)
        }

        if (job.status === 'noface') {
          res.status(200).send({
            mode: 'face',
            jobId: job.id,
            status: job.status,
            data: [],
            message: 'No face detected in the image',
          })
          return
        }

        if (job.status === 'failed') {
          res.status(502).send({
            message: job.error || 'CamGirlFinder face search failed',
          })
          return
        }

        res.status(200).send({
          mode: 'face',
          jobId: job.id,
          status: job.status,
          duration: job.duration,
          urls: job.urls,
          data: mapFaceSearchJobToPerformers(job, {limit}),
        })
        return
      }

      if (query.length < 3) {
        res.status(400).send({message: 'query must be at least 3 characters'})
        return
      }

      const accounts = await searchCamGirlFinderModels({
        model: query,
        platform: platform || undefined,
        gender: gender || undefined,
      })

      const similarByAccount: Record<string, ReturnType<typeof flattenSimilarPredictions>> = {}
      if (includeSimilar) {
        const top = accounts.slice(0, Math.min(5, accounts.length))
        await Promise.all(top.map(async (account) => {
          try {
            const similar = await getCamGirlFinderSimilar(account.platform, account.name)
            similarByAccount[`${String(account.platform).toLowerCase()}::${String(account.name).toLowerCase()}`] =
              flattenSimilarPredictions(similar)
          } catch {
            // Name search still works without similar accounts.
          }
        }))
      }

      res.status(200).send({
        mode: 'name',
        data: mapNameSearchAccountsToPerformers(accounts, {
          similarByAccount,
          limit,
        }),
      })
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || 'Failed to search CamGirlFinder.',
      })
    }
  }

  return {
    searchPerformers,
    searchScenes,
    matchScenes,
    status,
    getSceneMarkers,
    applySceneMarkers,
    searchCamGirlFinder,
  }
}
