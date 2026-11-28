import {z} from 'zod'
import type {ApiDb} from '../types/db'
import type {ApiRequest, ApiResponse} from '../types/http'
import {sendControllerError, sendOk} from '../types/errors'
import {previewDetachCopies, applyDetachCopies} from '../services/mediaSources/copyBulkDetach'

export const DetachCopiesQuerySchema = z.object({prefix: z.string().trim().min(1).max(4096), onlyUnavailable: z.boolean().optional()})
export const DetachCopiesApplySchema = DetachCopiesQuerySchema.extend({expectedCopies: z.number().int().min(0)})

export function createMediaCopiesBulkController(db: ApiDb) {
  return {
    preview(req: ApiRequest, res: ApiResponse) {
      try { sendOk(res, previewDetachCopies(db, req.body)) } catch (error) { sendControllerError(res, error, 'Unable to preview copy detachment') }
    },
    apply(req: ApiRequest, res: ApiResponse) {
      try { sendOk(res, applyDetachCopies(db, req.body)) } catch (error) { sendControllerError(res, error, 'Unable to detach copies') }
    },
  }
}
