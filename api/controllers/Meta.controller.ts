import type { ApiDb } from '../types/db'
import { apiErrorMessage } from '../types/errors'
import type { ApiRequest, ApiResponse } from '../types/http'
import { getRequestBody } from '../types/http'
import type { Meta, MetaWritePayload } from '@shared/entities/meta'
import type { MergeCategoriesPayload } from '@shared/api/payloads'
import { paramString } from '../types/errors'
import { createMetaRepository } from '../db/repositories/meta'
import { createMetaInMediaTypesRepository } from '../db/repositories/metaInMediaTypes'
import { createPinnedMetaRepository } from '../db/repositories/pinnedMeta'
import { mergeTagCategories, MetaCategoryMergeError } from '../services/metaCategoryMerge'
import { applyMeasurementUnitChange } from '../services/measurementUnitChange'
import fs from 'fs'
import path from 'path'

export default function (db: ApiDb) {
  const metaRepo = createMetaRepository(db.drizzle)
  const metaInMediaTypesRepo = createMetaInMediaTypesRepository(db.drizzle)
  const pinnedMetaRepo = createPinnedMetaRepository(db.drizzle)
  const metaFolder = path.join(db.path ?? '', 'meta')

  const create = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<MetaWritePayload>(req)
      const data = metaRepo.create(body as Record<string, unknown>)

      if (data.type === 'array') {
        const dir = path.join(metaFolder, String(data.id))
        if (!fs.existsSync(dir)) fs.mkdirSync(dir)
        metaRepo.ensureArrayMetaResources(data.id)
      }

      res.status(201).send(data)
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while performing query."
      })
    }
  }

  const findAll = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = metaRepo.findAll()
      res.status(201).send(data)
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while performing query."
      })
    }
  }

  const findOne = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = metaRepo.findById(Number(req.params.id)) ?? null
      res.status(201).send(data as Meta | null)
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while performing query."
      })
    }
  }

  const findLatest = function (req: ApiRequest, res: ApiResponse) {
    try {
      const data = metaRepo.findLatest(1)
      res.status(201).send(data)
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while performing query."
      })
    }
  }

  const update = function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<MetaWritePayload>(req)
      const metaId = parseInt(paramString(req.params.id), 10)
      const conversion = Object.prototype.hasOwnProperty.call(body, 'measurementUnit')
        ? applyMeasurementUnitChange(db.drizzle, metaId, body.measurementUnit)
        : null
      metaRepo.updateById(metaId, body as Record<string, unknown>)
      res.status(201).send(conversion ? {conversion} : {})
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while performing query."
      })
    }
  }

  const mergeCategories = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const body = getRequestBody<MergeCategoriesPayload>(req)
      const result = await mergeTagCategories(db, {
        survivorId: Number(body.survivorId),
        sourceIds: Array.isArray(body.sourceIds) ? body.sourceIds : [],
      })
      res.status(200).send(result)
    } catch (err: unknown) {
      if (err instanceof MetaCategoryMergeError) {
        return res.status(err.status).send({
          message: err.message,
        })
      }
      res.status(500).send({
        message: apiErrorMessage(err) || 'Some error occurred while merging categories.',
      })
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
      res.sendStatus(201)
    } catch (err: unknown) {
      res.status(500).send({
        message: apiErrorMessage(err) || "Some error occurred while performing query."
      })
    }
  }

  return {
    create,
    findAll,
    findOne,
    findLatest,
    update,
    mergeCategories,
    deleteOne
  }
}
