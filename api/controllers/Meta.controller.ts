import type { ApiDb } from '../types/db'
import { paramString, sendBadRequest, sendControllerError, sendCreated, sendOk } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'
import { getRequestBody } from '../types/http'
import type { Meta, MetaWritePayload } from '@shared/entities/meta'
import type { DuplicateCategoryPayload, MergeCategoriesPayload } from '@shared/api/payloads'
import { createMetaRepository } from '../db/repositories/meta'
import { createMetaInMediaTypesRepository } from '../db/repositories/metaInMediaTypes'
import { createPinnedMetaRepository } from '../db/repositories/pinnedMeta'
import { mergeTagCategories } from '../services/metaCategoryMerge'
import { duplicateTagCategory } from '../services/metaCategoryDuplicate'
import { applyMeasurementUnitChange } from '../services/measurementUnitChange'
import {
  chipRecipeDiscordInfo,
  exportChipRecipe,
  fetchChipRecipeCatalog,
  fetchChipRecipeFromCatalog,
  importChipRecipe,
  previewChipRecipe,
} from '../services/chipRecipe'
import { validatePathRegex } from '../../shared/pathParser/regexMeta'
import fs from 'fs'
import path from 'path'

function validateMetaPathRegex(body: MetaWritePayload): string | null {
  const pattern = body.pathRegex
  if (pattern == null || String(pattern).trim() === '') return null
  const result = validatePathRegex(String(pattern))
  return result.ok ? null : result.message
}

export default function (db: ApiDb) {
  const metaRepo = createMetaRepository(db.drizzle)
  const metaInMediaTypesRepo = createMetaInMediaTypesRepository(db.drizzle)
  const pinnedMetaRepo = createPinnedMetaRepository(db.drizzle)
  const metaFolder = path.join(db.path ?? '', 'meta')

  const create = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<MetaWritePayload>(req)
      const pathRegexError = validateMetaPathRegex(body)
      if (pathRegexError) {
        return sendBadRequest(res, pathRegexError)
      }
      const data = metaRepo.create(body as Record<string, unknown>)

      if (data.type === 'array') {
        const dir = path.join(metaFolder, String(data.id))
        if (!fs.existsSync(dir)) fs.mkdirSync(dir)
        metaRepo.ensureArrayMetaResources(data.id)
      }

      sendCreated(res, data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const findAll = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = metaRepo.findAll()
      sendOk(res, data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const findOne = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = metaRepo.findById(Number(req.params.id)) ?? null
      sendOk(res, data as Meta | null)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const findLatest = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = metaRepo.findLatest(1)
      sendOk(res, data)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const update = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<MetaWritePayload>(req)
      const pathRegexError = validateMetaPathRegex(body)
      if (pathRegexError) {
        return sendBadRequest(res, pathRegexError)
      }
      const metaId = parseInt(paramString(req.params.id), 10)
      const conversion = Object.prototype.hasOwnProperty.call(body, 'measurementUnit')
        ? applyMeasurementUnitChange(db.drizzle, metaId, body.measurementUnit)
        : null
      metaRepo.updateById(metaId, body as Record<string, unknown>)
      sendOk(res, conversion ? {conversion} : {})
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while performing query.')
    }
  }

  const mergeCategories = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<MergeCategoriesPayload>(req)
      const result = await mergeTagCategories(db, {
        survivorId: Number(body.survivorId),
        sourceIds: Array.isArray(body.sourceIds) ? body.sourceIds : [],
      })
      sendOk(res, result)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while merging categories.')
    }
  }

  const duplicate = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<DuplicateCategoryPayload>(req)
      const result = duplicateTagCategory(db, {
        id: Number(body.id),
        name: body.name,
      })
      sendCreated(res, result)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while duplicating category.')
    }
  }

  const deleteOne = function (req: ApiRequest, res: ApiResponse) {
    try {
      const id = Number(req.params.id)
      metaInMediaTypesRepo.deleteByMetaId(id)
      pinnedMetaRepo.deleteByMetaId(id)
      metaRepo.deleteById(id)
      const dir = path.join(metaFolder, paramString(req.params.id))
      fs.rmSync(dir, {
        recursive: true,
        force: true
      })
      sendOk(res)
    } catch (err) {
      sendControllerError(res, err, "Some error occurred while performing query.")
    }
  }

  const exportRecipe = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<{
        metaIds?: Array<number | string>
        name?: string
        id?: string
        description?: string
        author?: string
        category?: string
        sfw?: boolean
        includeTags?: boolean
      }>(req)
      const recipe = exportChipRecipe(db, {
        metaIds: body.metaIds,
        name: String(body.name || ''),
        id: body.id,
        description: body.description,
        author: body.author,
        category: body.category,
        sfw: body.sfw,
        includeTags: body.includeTags,
      })
      sendOk(res, recipe)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while exporting chip recipe.')
    }
  }

  const previewRecipe = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<{recipe?: unknown}>(req)
      const result = previewChipRecipe(db, body.recipe)
      sendOk(res, result)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while previewing chip recipe.')
    }
  }

  const importRecipe = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<{recipe?: unknown}>(req)
      const result = importChipRecipe(db, body.recipe)
      sendOk(res, result)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while importing chip recipe.')
    }
  }

  const chipRecipeCatalog = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const catalog = await fetchChipRecipeCatalog()
      sendOk(res, {
        ...catalog,
        discord: chipRecipeDiscordInfo(),
      })
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while fetching chip recipe catalog.')
    }
  }

  const chipRecipeCatalogFile = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const relativePath = String(req.query.path || '')
      const recipe = await fetchChipRecipeFromCatalog(relativePath)
      sendOk(res, recipe)
    } catch (err: unknown) {
      sendControllerError(res, err, 'Some error occurred while fetching chip recipe file.')
    }
  }

  return {
    create,
    findAll,
    findOne,
    findLatest,
    update,
    mergeCategories,
    duplicate,
    deleteOne,
    exportRecipe,
    previewRecipe,
    importRecipe,
    chipRecipeCatalog,
    chipRecipeCatalogFile,
  }
}
