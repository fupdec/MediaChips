import type { ApiDb } from '../../../../api/types/db'
import { apiErrorMessage } from '../../../../api/types/errors'
import type { ApiRequest, ApiResponse } from '../../../../api/types/http'
import fs from 'fs'
import { normalizeMediaPath } from '../../../../api/utils/normalizeUserPath'
import { importStashLibrary } from './stashImport'
import type { StashImportProgressEvent } from './stashImport'
import { pushStashLibrary } from './stashGraphql'

export default function createImportFromStashController(db: ApiDb) {
  const createStreamAbortSignal = (req: ApiRequest, res: ApiResponse) => {
    let stopped = false
    const stop = () => {
      stopped = true
    }
    req.on('aborted', stop)
    res.on('close', () => {
      if (!res.writableFinished) stop()
    })
    return () => stopped
  }

  const streamImportFromStash = async (req: ApiRequest, res: ApiResponse) => {
    const writeEvent = (event: Record<string, unknown> | StashImportProgressEvent) => {
      res.write(`${JSON.stringify(event)}\n`)
    }

    try {
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('X-Accel-Buffering', 'no')

      const rawPath = typeof req.body?.path === 'string' ? req.body.path : ''
      const stashDbPath = normalizeMediaPath(rawPath)
      if (!stashDbPath) {
        writeEvent({type: 'error', message: 'Stash database path is required'})
        res.end()
        return
      }

      if (!fs.existsSync(stashDbPath)) {
        writeEvent({type: 'error', message: `File not found: ${stashDbPath}`})
        res.end()
        return
      }

      const createMissingMedia = req.body?.createMissingMedia !== false
        && req.body?.createMissingMedia !== 0
        && req.body?.createMissingMedia !== '0'

      const isAborted = createStreamAbortSignal(req, res)

      writeEvent({
        type: 'progress',
        phase: 'starting',
        processed: 0,
        total: 0,
      })

      const result = await importStashLibrary(
        db,
        stashDbPath,
        {createMissingMedia},
        (event) => writeEvent(event),
        isAborted,
      )

      writeEvent({
        type: 'complete',
        ...result,
      })
      res.end()
    } catch (err) {
      writeEvent({
        type: 'error',
        message: apiErrorMessage(err) || 'Stash import failed',
      })
      res.end()
    }
  }

  const streamPushToStash = async (req: ApiRequest, res: ApiResponse) => {
    const writeEvent = (event: Record<string, unknown>) => {
      res.write(`${JSON.stringify(event)}\n`)
    }

    try {
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('X-Accel-Buffering', 'no')

      const graphqlUrl = typeof req.body?.graphqlUrl === 'string' ? req.body.graphqlUrl : ''
      const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey : ''
      if (!graphqlUrl.trim()) {
        writeEvent({type: 'error', message: 'Stash GraphQL URL is required'})
        res.end()
        return
      }
      if (!apiKey.trim()) {
        writeEvent({type: 'error', message: 'Stash API key is required'})
        res.end()
        return
      }

      const mediaIds = Array.isArray(req.body?.mediaIds)
        ? req.body.mediaIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id) && id > 0)
        : undefined
      const isAborted = createStreamAbortSignal(req, res)

      writeEvent({
        type: 'progress',
        phase: 'starting',
        processed: 0,
        total: 0,
      })

      const result = await pushStashLibrary(
        db,
        {
          graphqlUrl,
          apiKey,
          mediaIds,
        },
        (event) => writeEvent(event),
        isAborted,
      )

      writeEvent({
        type: 'complete',
        ...result,
      })
      res.end()
    } catch (err) {
      writeEvent({
        type: 'error',
        message: apiErrorMessage(err) || 'Stash push failed',
      })
      res.end()
    }
  }

  return {
    streamImportFromStash,
    streamPushToStash,
  }
}
