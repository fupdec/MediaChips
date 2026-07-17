import type {ApiDb} from '../../../../api/types/db'
import {apiErrorMessage} from '../../../../api/types/errors'
import type {ApiRequest, ApiResponse} from '../../../../api/types/http'
import {createJellyfinClient, importJellyfinLibrary} from './jellyfinImport'
import type {JellyfinImportProgressEvent, JellyfinOldIdPrefix} from './jellyfinImport'

function parseCreateMissingMedia(value: unknown): boolean {
  return value !== false && value !== 0 && value !== '0'
}

function parseLibraryIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const ids = value.map((item) => String(item).trim()).filter(Boolean)
  return ids.length ? ids : undefined
}

export default function createImportFromJellyfinController(
  db: ApiDb,
  defaults: {oldIdPrefix?: JellyfinOldIdPrefix} = {},
) {
  const oldIdPrefix = defaults.oldIdPrefix || 'jellyfin'

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

  const listLibraries = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const baseUrl = typeof req.body?.baseUrl === 'string' ? req.body.baseUrl : ''
      const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey : ''
      const client = createJellyfinClient({baseUrl, apiKey})
      const libraries = await client.listLibraries()
      res.json({ok: true, libraries})
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: apiErrorMessage(err) || 'Failed to list Jellyfin libraries',
      })
    }
  }

  const streamImportFromJellyfin = async (req: ApiRequest, res: ApiResponse) => {
    const writeEvent = (event: Record<string, unknown> | JellyfinImportProgressEvent) => {
      res.write(`${JSON.stringify(event)}\n`)
    }

    try {
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('X-Accel-Buffering', 'no')

      const baseUrl = typeof req.body?.baseUrl === 'string' ? req.body.baseUrl : ''
      const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey : ''
      if (!baseUrl.trim()) {
        writeEvent({type: 'error', message: 'Jellyfin server URL is required'})
        res.end()
        return
      }
      if (!apiKey.trim()) {
        writeEvent({type: 'error', message: 'Jellyfin API key is required'})
        res.end()
        return
      }

      const createMissingMedia = parseCreateMissingMedia(req.body?.createMissingMedia)
      const libraryIds = parseLibraryIds(req.body?.libraryIds)
      const isAborted = createStreamAbortSignal(req, res)

      writeEvent({
        type: 'progress',
        phase: 'starting',
        processed: 0,
        total: 0,
      })

      const result = await importJellyfinLibrary(
        db,
        {
          baseUrl,
          apiKey,
          libraryIds,
          createMissingMedia,
          oldIdPrefix,
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
        message: apiErrorMessage(err) || 'Jellyfin import failed',
      })
      res.end()
    }
  }

  return {
    listLibraries,
    streamImportFromJellyfin,
  }
}
