import type { ApiDb, FilterLike } from '../types/db'
import { sendBadRequest, sendControllerError, sendCreated, sendNotFound, sendOk } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'
import type { DeleteEntityOnePayload, EntityUpdatePayload } from '@shared/api/responses'
import type {
  CreateTagPayload,
  DuplicateTagPayload,
  MergeTagsPayload,
  MoveTagsToCategoryPayload,
  TagItemsListRequest,
  TagThumbsRequestPayload,
} from '@shared/api/payloads'
import { getRequestBody } from '../types/http'
import { createTagsRepository } from '../db/repositories/tags'
import { createMarksRepository } from '../db/repositories/marks'
import {
  deleteTagGeneratedAssets,
} from '../services/localAssetCleanup'
import { findDefaultTagCategoryId } from '../services/defaultTagCategory'
import { mergeTagsInCategory } from '../services/tagMerge'
import {
  moveTagsToCategory,
} from '../services/tagMoveToCategory'
import { duplicateTag } from '../services/tagDuplicate'
import {
  assertTagNameAvailable,
  assertTagNamesAvailable,
} from '../services/tagNameUniqueness'
import { loadTagItems } from '../services/tagItemsLoader'
import { findCooccurringTags } from '../services/tagCooccurrence'
import {
  mapWithConcurrency,
  readImageAsDataUrl,
} from '../services/thumbEncoding'
import path from 'path'

export default function (db: ApiDb) {
  const tagsRepo = createTagsRepository(db.drizzle, db.sqlite)
  const marksRepo = createMarksRepository(db.drizzle)
  const getDbPath = () => db.path!

  const getAllForItems = async function (req: ApiRequest, res: ApiResponse) {
    const body = getRequestBody<TagItemsListRequest>(req)
    const metaId = Number(body.metaId)
    if (!Number.isFinite(metaId)) {
      return sendBadRequest(res, 'metaId is required')
    }

    const ids = Array.isArray(body.ids)
      ? body.ids.map((id: unknown) => Number(id)).filter((id: unknown) => Number.isFinite(id))
      : []

    try {
      const limit = Number(body.limit)
      const page = Number(body.page) || 1
      const result = await loadTagItems(db, {
        metaId,
        ids,
        filters: (body.filters ?? []) as unknown as FilterLike[],
        sortBy: body.sortBy ?? 'id',
        direction: body.direction ?? 'desc',
        find_duplicates: body.find_duplicates ?? false,
        page,
        limit: limit > 0 ? limit : null,
        skipTotals: body.skipTotals === true,
        search: typeof body.search === 'string'
          ? body.search
          : (typeof body.query === 'string' ? body.query : undefined),
        searchMode: body.searchMode === 'substring' || body.searchMode === 'chars'
          ? body.searchMode
          : undefined,
        groupBy: body.groupBy,
      })
      sendOk(res, result)
    } catch (err) {
      console.log(err)
      sendControllerError(res, err, 'Some error occurred while retrieving media.')
    }
  };

  const create = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<CreateTagPayload[]>(req)
      if (!Array.isArray(body) || !body.length) {
        return sendBadRequest(res, 'At least one tag is required')
      }

      const defaultMetaId = findDefaultTagCategoryId(db.sqlite)
      const items = body.map((item) => {
        const requested = Number(item.metaId)
        const metaId = Number.isFinite(requested) && requested > 0
          ? requested
          : defaultMetaId
        return {
          ...item,
          metaId: metaId != null && Number(metaId) > 0 ? Number(metaId) : null,
        }
      })

      if (items.some((item) => item.metaId == null)) {
        return sendBadRequest(res, 'Tag category is required. Create a Tags category first.')
      }

      assertTagNamesAvailable(
        db.sqlite,
        items.map((item) => String(item.name ?? '')),
      )

      const data = tagsRepo.bulkCreate(items)
      sendCreated(res, data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  };

  const findOne = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = tagsRepo.findById(Number(req.params.id)) ?? null
      sendOk(res, data)
    } catch (err) {
      sendControllerError(res, err, "Some error occurred while retrieving media.")
    }
  };

  const getCooccurring = function (req: ApiRequest, res: ApiResponse) {
    try {
      const tagId = Number(req.params.id)
      if (!Number.isFinite(tagId) || tagId <= 0) {
        return sendBadRequest(res, 'tag id is required')
      }

      const mediaTypeRaw = req.query.mediaTypeId
      const mediaTypeId = mediaTypeRaw != null && mediaTypeRaw !== ''
        ? Number(mediaTypeRaw)
        : null

      if (mediaTypeId != null && !Number.isFinite(mediaTypeId)) {
        return sendBadRequest(res, 'mediaTypeId must be a number')
      }

      const data = findCooccurringTags(db, tagId, mediaTypeId)
      sendOk(res, data)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while retrieving co-occurring tags.')
    }
  };
  
  const getCount = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const count = tagsRepo.countAll()
      sendOk(res, {count})
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const getAll = function (req: ApiRequest, res: ApiResponse) {
    try {
      // Catalog projection: chips/bootstrap don't need oldId or row timestamps.
      const data = tagsRepo.findAllCatalog()
      sendOk(res, data)
    } catch (err) {
      sendControllerError(res, err, "Some error occurred while retrieving media.")
    }
  };

  const update = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<EntityUpdatePayload>(req)
      const { silent, ...updates } = body
      const tagId = Number(req.params.id)
      if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
        assertTagNameAvailable(db.sqlite, String((updates as {name?: unknown}).name ?? ''), tagId)
      }
      tagsRepo.updateById(tagId, updates as Record<string, unknown>, {silent: Boolean(silent)})
      sendOk(res, [1])
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while retrieving media.')
    }
  };

  const merge = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<MergeTagsPayload>(req)
      const result = await mergeTagsInCategory(db, {
        metaId: Number(body.metaId),
        survivorId: Number(body.survivorId),
        sourceIds: Array.isArray(body.sourceIds) ? body.sourceIds : [],
      })
      sendOk(res, result)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while merging tags.')
    }
  }

  const moveToCategory = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<MoveTagsToCategoryPayload>(req)
      const result = await moveTagsToCategory(db, {
        tagIds: Array.isArray(body.tagIds) ? body.tagIds : [],
        targetMetaId: Number(body.targetMetaId),
        onConflict: body.onConflict === 'merge' ? 'merge' : 'abort',
      })
      sendOk(res, result)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while moving tags.')
    }
  }

  const duplicate = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<DuplicateTagPayload>(req)
      const result = duplicateTag(db, {
        id: Number(body.id),
        name: body.name,
      })
      sendCreated(res, result)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while duplicating tag.')
    }
  }

  const deleteOne = async function (req: ApiRequest, res: ApiResponse) {
    const body = getRequestBody<DeleteEntityOnePayload>(req)
    const id = body.id

    try {
      const tag = tagsRepo.findById(Number(id))

      if (!tag) {
        return sendNotFound(res, 'Tag not found.')
      }

      const metaId = req.body.metaId || tag.metaId
      if (!metaId) {
        return sendBadRequest(res, 'metaId is required to delete tag assets.')
      }

      const tagName = typeof tag.name === 'string' ? tag.name.trim() : ''
      marksRepo.convertMetaMarksToBookmarksByTagId(id, tagName)

      await deleteTagGeneratedAssets(getDbPath(), metaId, id)

      tagsRepo.deleteById(Number(id))
      sendOk(res)
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  };

  const getThumbs = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<TagThumbsRequestPayload>(req)
      const metaId = Number(body.metaId)
      if (!Number.isFinite(metaId)) {
        return sendBadRequest(res, 'metaId is required')
      }

      const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : []
      const types = Array.isArray(body.types) && body.types.length
        ? body.types
        : ['main', 'avatar', 'alt', 'custom1', 'custom2']
      const metaDir = path.join(getDbPath(), 'meta', String(metaId))

      const entries = await mapWithConcurrency(ids, 6, async (id) => {
        const tagThumbs: Record<string, string> = {}

        await Promise.all(types.map(async (type) => {
          const filePath = path.join(metaDir, `${id}_${type}.jpg`)
          const dataUrl = await readImageAsDataUrl(filePath)
          if (dataUrl) {
            tagThumbs[type] = dataUrl
          }
        }))

        return Object.keys(tagThumbs).length
          ? [String(id), tagThumbs] as const
          : null
      })

      const thumbs: Record<string, Record<string, string>> = {}
      for (const entry of entries) {
        if (entry) {
          const [id, tagThumbs] = entry
          thumbs[id] = tagThumbs
        }
      }

      sendOk(res, {thumbs})
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while retrieving tag thumbnails.')
    }
  }

  return {
    create,
    getCount,
    getAllForItems,
    getThumbs,
    getAll,
    findOne,
    getCooccurring,
    update,
    merge,
    moveToCategory,
    duplicate,
    deleteOne,
  }
}
