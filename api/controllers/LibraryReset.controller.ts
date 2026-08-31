import type {ApiDb} from '../types/db'
import type {ApiRequest, ApiResponse} from '../types/http'
import {getRequestBody} from '../types/http'
import {sendControllerError, sendOk} from '../types/errors'
import type {LibraryResetMediaPayload, LibraryResetTagsPayload} from '@shared/api/payloads'
import {runNdjsonAsyncGenerator} from './tasks/ndjsonStreamRunner'
import {
  getLibraryResetCounts,
  iterateLibraryResetMedia,
  iterateLibraryResetTags,
} from '../services/libraryReset'

export default function createLibraryResetController(db: ApiDb) {
  const getCounts = function (_req: ApiRequest, res: ApiResponse) {
    try {
      sendOk(res, getLibraryResetCounts(db))
    } catch (err) {
      sendControllerError(res, err, 'Library reset counts failed.')
    }
  }

  const resetMedia = async function (req: ApiRequest, res: ApiResponse) {
    const body = getRequestBody<LibraryResetMediaPayload>(req)
    await runNdjsonAsyncGenerator(req, res, {
      iterate: (shouldStop) => iterateLibraryResetMedia(db, {
        mediaTypeId: body.mediaTypeId,
        permanent: body.permanent,
        withFile: body.withFile,
      }, shouldStop),
      errorMessage: 'Library reset media failed.',
    })
  }

  const resetTags = async function (req: ApiRequest, res: ApiResponse) {
    const body = getRequestBody<LibraryResetTagsPayload>(req)
    await runNdjsonAsyncGenerator(req, res, {
      iterate: (shouldStop) => iterateLibraryResetTags(db, {
        metaId: body.metaId,
        permanent: body.permanent,
      }, shouldStop),
      errorMessage: 'Library reset tags failed.',
    })
  }

  return {getCounts, resetMedia, resetTags}
}
