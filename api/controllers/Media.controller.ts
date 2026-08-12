import type { ApiDb, FilterLike } from '../types/db'
import { apiErrorMessage, sendControllerError, sendNotFound, sendOk } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'
import { getRequestBody } from '../types/http'
import type { ItemsListRequest, DeleteEntityOnePayload, EntityUpdatePayload } from '@shared/api/responses'
import type {
  MediaDuplicateGroupsPayload,
  MediaPathUpdatePayload,
  MediaThumbsRequestPayload,
  MergeMediaPayload,
} from '@shared/api/payloads'
import {listMediaDuplicateGroups} from '../services/mediaDuplicateGroups'
import {mergeMediaItems} from '../services/mediaMerge'
import { createMediaRepository } from '../db/repositories/media'
import { createMediaTypesRepository } from '../db/repositories/mediaTypes'
import path from 'path'
import { parseMediaFilePath } from '../../shared/mediaPath'
import {
  deleteMediaGeneratedAssets,
  unlinkResolvedPath,
} from '../services/localAssetCleanup'
import {
  loadMediaItems,
  loadFilteredMediaIds,
  loadMediaBasicsByIds,
} from '../services/mediaItemsLoader'
import {findVisualSimilarIds} from '../services/visualHashBackfill'
import {
  suggestTagsFromSimilarForMedia,
  suggestTagsFromSimilarForMediaIds,
} from '../services/suggestTagsFromSimilar'
import {
  findSimilarByClip,
  semanticSearchMedia,
} from '../services/mediaClipEmbeddings'
import {getClipEmbeddingStatus} from '../services/clipEmbeddingModel'
import { invalidateMediaDerivedCaches } from '../services/mediaCacheInvalidation'
import {
  mapWithConcurrency,
  readFirstExistingImageDataUrl,
} from '../services/thumbEncoding'
import { getZipArchivePath, isVirtualZipPath } from '../../shared/zipPath'

export default function (db: ApiDb) {
  const mediaRepo = createMediaRepository(db.drizzle)
  const mediaTypesRepo = createMediaTypesRepository(db.drizzle)
  const getDbPath = () => db.path!

  const getAll = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<ItemsListRequest>(req)
      const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : []
      const limit = Number(body.limit)
      const page = Number(body.page) || 1

      const result = await loadMediaItems(db, {
        mediaTypeId: body.mediaTypeId,
        ids,
        filters: body.filters as unknown as FilterLike[] | undefined,
        filtersJoin: body.filtersJoin === 'or' ? 'or' : 'and',
        sortBy: body.sortBy,
        direction: body.direction,
        find_duplicates: body.find_duplicates,
        duplicates_by: body.duplicates_by || 'filesize',
        page,
        limit: limit > 0 ? limit : null,
        includeNavigation: body.includeNavigation === true && !ids.length,
        skipTotals: body.skipTotals === true,
        groupBy: body.groupBy,
      })

      sendOk(res, result)
    } catch (err) {
      sendControllerError(res, err, "Some error occurred while retrieving media.")
    }
  };

  const getFilteredIds = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<ItemsListRequest>(req)
      const result = await loadFilteredMediaIds(db, {
        mediaTypeId: body.mediaTypeId,
        filters: body.filters as unknown as FilterLike[] | undefined,
        filtersJoin: body.filtersJoin === 'or' ? 'or' : 'and',
        sortBy: body.sortBy,
        direction: body.direction,
        find_duplicates: body.find_duplicates,
        duplicates_by: body.duplicates_by || 'filesize',
      })

      sendOk(res, result)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while retrieving media ids.')
    }
  }

  const similarByVisual = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<{seedId?: number, limit?: number}>(req)
      const seedId = Number(body.seedId)
      const parsedLimit = body.limit == null ? NaN : Number(body.limit)
      const result = findVisualSimilarIds(db, seedId, {
        ...(Number.isFinite(parsedLimit) && parsedLimit > 0 ? {limit: parsedLimit} : {}),
      })
      sendOk(res, result)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while finding similar media.')
    }
  }

  const suggestTagsFromSimilar = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<{
        seedId?: number
        mediaIds?: Array<number | string>
        neighborLimit?: number
        tagLimit?: number
        minCount?: number
        apply?: boolean
      }>(req)
      const options = {
        neighborLimit: body.neighborLimit,
        tagLimit: body.tagLimit,
        minCount: body.minCount,
        apply: Boolean(body.apply),
      }
      const mediaIds = Array.isArray(body.mediaIds) ? body.mediaIds : []
      if (mediaIds.length) {
        sendOk(res, suggestTagsFromSimilarForMediaIds(db, mediaIds, options))
        return
      }
      const seedId = Number(body.seedId)
      if (!Number.isFinite(seedId) || seedId <= 0) {
        sendControllerError(res, new Error('seedId or mediaIds is required'), 'seedId or mediaIds is required')
        return
      }
      sendOk(res, suggestTagsFromSimilarForMedia(db, seedId, options))
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while suggesting tags from similar media.')
    }
  }

  const semanticSearch = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<{
        query?: string
        mediaTypeId?: number | string | null
        limit?: number
        locale?: string | null
      }>(req)
      const mediaTypeId = body.mediaTypeId == null ? null : Number(body.mediaTypeId)
      const parsedLimit = body.limit == null ? NaN : Number(body.limit)
      const locale = body.locale == null ? null : String(body.locale)
      const result = await semanticSearchMedia(db, {
        query: String(body.query || ''),
        mediaTypeId: Number.isFinite(mediaTypeId as number) ? mediaTypeId : null,
        ...(Number.isFinite(parsedLimit) && parsedLimit > 0 ? {limit: parsedLimit} : {}),
        locale,
      })
      const model = getClipEmbeddingStatus(db)
      sendOk(res, {
        ...result,
        modelStatus: result.modelStatus || model.status,
      })
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while running semantic search.')
    }
  }

  const similarByClip = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<{seedId?: number, limit?: number}>(req)
      const seedId = Number(body.seedId)
      const parsedLimit = body.limit == null ? NaN : Number(body.limit)
      const result = await findSimilarByClip(db, seedId, {
        ...(Number.isFinite(parsedLimit) && parsedLimit > 0 ? {limit: parsedLimit} : {}),
      })
      sendOk(res, result)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while finding semantically similar media.')
    }
  }

  const merge = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<MergeMediaPayload>(req)
      const result = await mergeMediaItems(db, {
        survivorId: Number(body.survivorId),
        sourceIds: Array.isArray(body.sourceIds) ? body.sourceIds : [],
        withFile: Boolean(body.with_file),
      })
      sendOk(res, result)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while merging media.')
    }
  }

  const duplicateGroups = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<MediaDuplicateGroupsPayload>(req)
      const mediaTypeId = body.mediaTypeId == null ? null : Number(body.mediaTypeId)
      const result = listMediaDuplicateGroups(db, {
        duplicatesBy: String(body.duplicates_by || 'filesize'),
        mediaTypeId: Number.isFinite(mediaTypeId as number) ? mediaTypeId : null,
      })
      sendOk(res, result)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while listing duplicate groups.')
    }
  }

  const getBasicsByIds = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : []
      const items = await loadMediaBasicsByIds(db, ids)
      sendOk(res, {items})
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while retrieving media.')
    }
  }

  const getThumbs = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<MediaThumbsRequestPayload>(req)
      const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : []
      const mediaType = String(body.mediaType || 'videos')
      const basePath = path.join(getDbPath(), 'media', mediaType)

      const entries = await mapWithConcurrency(ids, 8, async (id) => {
        const dataUrl = await readFirstExistingImageDataUrl(basePath, id, ['thumbs', 'grids'])
        return dataUrl ? [String(id), dataUrl] as const : null
      })

      const thumbs: Record<string, string> = {}
      for (const entry of entries) {
        if (entry) {
          const [id, dataUrl] = entry
          thumbs[id] = dataUrl
        }
      }

      sendOk(res, {thumbs})
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while retrieving thumbnails.')
    }
  }

  const getStats = async function (req: ApiRequest, res: ApiResponse) {
    try {
      sendOk(res, mediaRepo.getStats(db))
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const getOneById = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = mediaRepo.findById(Number(req.params.id)) ?? null
      sendOk(res, data)
    } catch (err) {
      sendControllerError(res, err, "Some error occurred while retrieving media.")
    }
  };

  const numberOfMediaWithTag = function (req: ApiRequest, res: ApiResponse) {
    try {
      const count = mediaRepo.countWithTag(req.query.tagId)
      sendOk(res, {count})
    } catch (err) {
      sendControllerError(res, err, "Some error occurred while performing query.")
    }
  };

  const updatePath = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<MediaPathUpdatePayload>(req)
      const data = parseMediaFilePath(String(body.path ?? ''))

      mediaRepo.updateById(Number(body.id), data, {silent: true})
      invalidateMediaDerivedCaches()
      sendOk(res, [1])
    } catch (err) {
      sendControllerError(res, err, "Some error occurred while retrieving media.")
    }
  };

  const update = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<EntityUpdatePayload>(req)
      mediaRepo.updateById(Number(req.params.id), body, {silent: Boolean(body.silent)})
      invalidateMediaDerivedCaches()
      sendOk(res, [1])
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while retrieving media.')
    }
  }

  const deleteOne = async function (req: ApiRequest, res: ApiResponse) {
    const body = getRequestBody<DeleteEntityOnePayload>(req)
    const id = body.id

    try {
      const media = mediaRepo.findById(Number(id))

      if (!media) {
        return sendNotFound(res, 'Media not found.')
      }

      const mediaPath = String(media.path || body.path || '')
      const deleteZipGallery = Boolean(body.delete_zip_gallery) && isVirtualZipPath(mediaPath)
      const zipArchivePath = deleteZipGallery ? getZipArchivePath(mediaPath) : null
      const deleteZipFile = Boolean(body.delete_zip_file) && Boolean(zipArchivePath)

      const targets = (() => {
        if (!zipArchivePath) return [media]
        const gallery = mediaRepo.findByZipArchivePrefix(zipArchivePath)
        return gallery.length ? gallery : [media]
      })()

      const deletedIds: number[] = []

      for (const target of targets) {
        const targetId = Number(target.id)
        if (!Number.isFinite(targetId) || targetId <= 0) continue

        const mediaType = target.mediaTypeId
          ? mediaTypesRepo.findById(Number(target.mediaTypeId))
          : undefined

        await deleteMediaGeneratedAssets(db, getDbPath(), target, mediaType?.type || '')

        // ZIP entries are read-only on disk; only unlink real files when requested.
        if (body.with_file && !isVirtualZipPath(String(target.path || ''))) {
          const filePath = target.path || body.path
          try {
            const deleted = await unlinkResolvedPath(String(filePath ?? ''))
            if (!deleted) {
              console.log(`${filePath} is unavailable.`)
            }
          } catch (error) {
            console.error(`Failed to delete media file ${filePath}:`, apiErrorMessage(error))
          }
        }

        mediaRepo.deleteById(targetId)
        deletedIds.push(targetId)
      }

      let zipFileDeleted = false
      if (deleteZipFile && zipArchivePath) {
        try {
          zipFileDeleted = Boolean(await unlinkResolvedPath(zipArchivePath))
          if (!zipFileDeleted) {
            console.log(`ZIP archive unavailable for delete: ${zipArchivePath}`)
          }
        } catch (error) {
          console.error(`Failed to delete ZIP archive ${zipArchivePath}:`, apiErrorMessage(error))
        }
      }

      invalidateMediaDerivedCaches()
      sendOk(res, { deletedIds, zipFileDeleted })
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  };

  return {
    numberOfMediaWithTag,
    updatePath,
    update,
    deleteOne,
    getOneById,
    getAll,
    getFilteredIds,
    getBasicsByIds,
    getThumbs,
    getStats,
    similarByVisual,
    suggestTagsFromSimilar,
    semanticSearch,
    similarByClip,
    merge,
    duplicateGroups,
  }
}
