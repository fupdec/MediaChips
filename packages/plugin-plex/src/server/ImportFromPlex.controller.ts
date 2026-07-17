import type {ApiDb} from '../../../../api/types/db'
import {apiErrorMessage} from '../../../../api/types/errors'
import type {ApiRequest, ApiResponse} from '../../../../api/types/http'
import {createPlexClient, importPlexLibrary} from './plexImport'
import type {PlexImportProgressEvent} from './plexImport'

function parseCreateMissingMedia(value: unknown): boolean {
  return value !== false && value !== 0 && value !== '0'
}

function parseLibraryIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const ids = value.map((item) => String(item).trim()).filter(Boolean)
  return ids.length ? ids : undefined
}

export default function createImportFromPlexController(
  db: ApiDb,
) {
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
      const token = typeof req.body?.token === 'string' ? req.body.token : ''
      const client = createPlexClient({baseUrl, token})
      const libraries = await client.listLibraries()
      res.json({ok: true, libraries})
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: apiErrorMessage(err) || 'Failed to list Plex libraries',
      })
    }
  }

  const streamImportFromPlex = async (req: ApiRequest, res: ApiResponse) => {
    const writeEvent = (event: Record<string, unknown> | PlexImportProgressEvent) => {
      res.write(`${JSON.stringify(event)}\n`)
    }

    try {
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('X-Accel-Buffering', 'no')

      const baseUrl = typeof req.body?.baseUrl === 'string' ? req.body.baseUrl : ''
      const token = typeof req.body?.token === 'string' ? req.body.token : ''
      if (!baseUrl.trim()) {
        writeEvent({type: 'error', message: 'Plex server URL is required'})
        res.end()
        return
      }
      if (!token.trim()) {
        writeEvent({type: 'error', message: 'Plex token is required'})
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

      const result = await importPlexLibrary(
        db,
        {
          baseUrl,
          token,
          libraryIds,
          createMissingMedia,
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
        message: apiErrorMessage(err) || 'Plex import failed',
      })
      res.end()
    }
  }

  return {
    listLibraries,
    streamImportFromPlex,
  }
}
