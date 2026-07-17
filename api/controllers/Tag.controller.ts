import type { ApiDb, FilterLike } from '../types/db'
import { apiErrorMessage } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'
import type { DeleteEntityOnePayload, EntityUpdatePayload } from '@shared/api/responses'
import type { CreateTagPayload, TagItemsListRequest, TagThumbsRequestPayload } from '@shared/api/payloads'
import { getRequestBody } from '../types/http'
import { createTagsRepository } from '../db/repositories/tags'
import { createMarksRepository } from '../db/repositories/marks'
import {
  deleteTagGeneratedAssets,
} from '../services/localAssetCleanup'
import { loadTagItems } from '../services/tagItemsLoader'
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
      return res.status(400).send({
        message: 'metaId is required',
      })
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
      })
      res.status(201).send(result)
    } catch (err) {
      console.log(err)

      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while retrieving media."
      })
    }
  };

  const create = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<CreateTagPayload[]>(req)
      const data = tagsRepo.bulkCreate(body)
      res.status(201).send(data)
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while performing query."
      })
    }
  };

  const findOne = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = tagsRepo.findById(Number(req.params.id)) ?? null
      res.status(201).send(data)
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while retrieving media."
      })
    }
  };

  const getCount = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const count = tagsRepo.countAll()
      res.status(200).send({count})
    } catch (err) {
      res.status(500).send({
        message: apiErrorMessage(err) || 'Some error occurred while performing query.',
      })
    }
  }

  const getAll = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = tagsRepo.findAllRaw()
      res.status(201).send(data)
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while retrieving media."
      })
    }
  };

  const update = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<EntityUpdatePayload>(req)
      const { silent, ...updates } = body
      tagsRepo.updateById(Number(req.params.id), updates as Record<string, unknown>, {silent: Boolean(silent)})
      res.status(201).send([1])
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while retrieving media."
      })
    }
  };

  const deleteOne = async function (req: ApiRequest, res: ApiResponse) {
    const body = getRequestBody<DeleteEntityOnePayload>(req)
    const id = body.id

    try {
      const tag = tagsRepo.findById(Number(id))

      if (!tag) {
        return res.status(404).send({
          message: 'Tag not found.',
        })
      }

      const metaId = req.body.metaId || tag.metaId
      if (!metaId) {
        return res.status(400).send({
          message: 'metaId is required to delete tag assets.',
        })
      }

      const tagName = typeof tag.name === 'string' ? tag.name.trim() : ''
      marksRepo.convertMetaMarksToBookmarksByTagId(id, tagName)

      await deleteTagGeneratedAssets(getDbPath(), metaId, id)

      tagsRepo.deleteById(Number(id))
      res.sendStatus(201)
    } catch (err) {
      res.status(500).send({
        message: apiErrorMessage(err) || 'Some error occurred while performing query.',
      })
    }
  };

  const getThumbs = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<TagThumbsRequestPayload>(req)
      const metaId = Number(body.metaId)
      if (!Number.isFinite(metaId)) {
        return res.status(400).send({message: 'metaId is required'})
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

      res.status(200).send({thumbs})
    } catch (err) {
      res.status(500).send({
        message: apiErrorMessage(err) || 'Some error occurred while retrieving tag thumbnails.',
      })
    }
  }

  return {
    create,
    getCount,
    getAllForItems,
    getThumbs,
    getAll,
    findOne,
    update,
    deleteOne,
  }
}
