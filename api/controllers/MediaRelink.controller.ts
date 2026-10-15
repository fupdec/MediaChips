import type {ApiDb} from '../types/db'
import type {ApiRequest, ApiResponse} from '../types/http'
import {sendControllerError, sendOk} from '../types/errors'
import {applyMediaRelinks, inspectMediaRelink, previewMediaRootRelink} from '../services/mediaRelink'

export function createMediaRelinkController(db: ApiDb) {
  return {
    async preview(req: ApiRequest, res: ApiResponse) {
      try {
        const body = req.body
        const candidates = body.id != null
          ? [await inspectMediaRelink(db, {id: Number(body.id), oldPath: body.oldPath, newPath: body.newPath})]
          : await previewMediaRootRelink(db, body.oldRoot, body.newRoot)
        sendOk(res, {candidates})
      } catch (error) {
        sendControllerError(res, error, 'Unable to preview file locations')
      }
    },
    async apply(req: ApiRequest, res: ApiResponse) {
      try {
        sendOk(res, await applyMediaRelinks(db, req.body.matches))
      } catch (error) {
        sendControllerError(res, error, 'Unable to restore file locations')
      }
    },
  }
}
