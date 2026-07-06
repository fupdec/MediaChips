import type { ApiDb, MediaLike } from '../../api/types/db'
import type { ApiRequest, ApiResponse } from '../../api/types/http'
import { apiErrorMessage, paramString } from '../../api/types/errors'
import type {
  BuiltinRoutesOptions,
  FileResolverResult,
  ResolveFilePathFn,
} from '../types/builtinRoutes'
import type { ServerDatabaseEntry } from '../types/server'
import path from 'path'
import fs from 'fs'
import { createMediaRepository } from '../../api/db/repositories/media'
import { normalizeMediaPath } from '../../api/utils/normalizeUserPath'
import { isLanAccessEnabled, isLanAccessEnvLocked } from './lanAccess'
import { isLoopbackHost } from './constants'
import { saveConfigFile } from './configFile'
import { isClientAbortError, safeJsonError } from './fileResolver'
import { streamVideoFile } from '../../api/services/transcode/streamVideoFile'
import { parseMaxHeightOverride } from '../../api/services/transcode/transcodeSettings'
import { getDatabaseManager } from './databaseRegistry'
import { createStorageDirectories } from './serverConfig'
import { checkFilesExist } from '../../api/services/checkFilesExist'
import packageJson from '../../package.json'

function resolveMediaVideoPath(
  db: ApiDb,
  resolveFilePath: ResolveFilePathFn,
  mediaId: string | number,
): Promise<FileResolverResult> {
  const video = createMediaRepository(db.drizzle).findById(Number(mediaId)) as MediaLike | undefined
  if (!video || !video.path) {
    return Promise.resolve({error: {status: 404, body: {message: 'Video not found in database'}}})
  }

  const videoPath = resolveFilePath(video.path)
  if (!videoPath || !fs.existsSync(videoPath)) {
    return Promise.resolve({error: {status: 404, body: {message: "Video file doesn't exist"}}})
  }

  return Promise.resolve({video, videoPath})
}

function registerBuiltinRoutes({
  app,
  router,
  config,
  configPath,
  databasesPath,
  db,
  routeLoadErrors,
  resolveFilePath,
  getStreamContentType,
  transcodeManager,
}: BuiltinRoutesOptions) {
  app.get('/api/health', (req: ApiRequest, res: ApiResponse) => {
    console.log('Health check from:', req.headers.origin || 'unknown origin')
    res.json({
      status: 'online',
      service: 'mediachips-server',
      version: packageJson.version,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      ip: 'localhost',
      port: config.port,
      taskRoutesLoaded: !routeLoadErrors.some((entry) => entry.routeFile === 'Task.routes'),
      routeLoadErrors,
    })
  })

  app.get('/api/ping', (req: ApiRequest, res: ApiResponse) => {
    res.json({
      pong: Date.now(),
      ip: 'localhost',
      port: config.port,
      message: 'Server is online',
    })
  })

  app.get('/api/getMachineId', async (req: ApiRequest, res: ApiResponse) => {
    try {
      const { machineId } = await import('node-machine-id')
      const id = await machineId()
      res.status(200).send(id)
    } catch (error: unknown) {
      console.error('getMachineId failed:', error)
      res.status(500).json({message: 'Failed to get machine id'})
    }
  })

  app.get('/api/config', (req: ApiRequest, res: ApiResponse) => {
    console.log('Config request from:', req.headers.origin || 'unknown origin')

    const activeDb = config.databases.find((dbEntry: ServerDatabaseEntry) => dbEntry.active)
    const requestHostname = req.hostname
    const frontendIp = requestHostname && !isLoopbackHost(requestHostname)
      ? requestHostname
      : config.ip

    const responseConfig = {
      ip: frontendIp,
      ips: config.ips,
      hostname: config.hostname,
      port: config.port,
      appVersion: (packageJson.version || '1.0.0').replace(/(-beta)+$/i, '-beta'),
      path: activeDb ? path.join(databasesPath, activeDb.id) : '',
      databases: config.databases || [],
      activeDatabase: activeDb,
      serverInfo: {
        webUrl: `http://${frontendIp}:${config.port}`,
        apiUrl: `http://${frontendIp}:${config.port}/api`,
        wsUrl: `ws://${frontendIp}:${config.port}`,
        detectedAt: new Date().toISOString(),
      },
      allowLanAccess: isLanAccessEnabled(),
      allowLanAccessEnvLocked: isLanAccessEnvLocked(),
      registration: typeof config.registration === 'string' ? config.registration : '',
      ...(typeof config.onboardingCompleted === 'string' ? { onboardingCompleted: config.onboardingCompleted } : {}),
      ...(typeof config.onboardingStep === 'string' ? { onboardingStep: config.onboardingStep } : {}),
      ...(typeof config.onboardingPaused === 'string' ? { onboardingPaused: config.onboardingPaused } : {}),
    }

    res.json(responseConfig)
  })

  app.post('/api/update-config', (req: ApiRequest, res: ApiResponse) => {
    Object.assign(config, req.body)

    if (Array.isArray(req.body?.databases)) {
      createStorageDirectories(config, databasesPath)
    }

    const activeDb = config.databases.find((dbEntry: ServerDatabaseEntry) => dbEntry.active)
    if (activeDb) {
      config.path = path.join(databasesPath, activeDb.id)
    }

    saveConfigFile(configPath, config)
    console.log('\x1b[36m%s\x1b[0m', `Config updated. Active database: ${activeDb?.name || 'none'}`)

    res.json({success: true, message: 'Configuration updated'})
  })

  const FILE_MIME_TYPES = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
  } as const

  function getFileRequestPath(req: ApiRequest): string | null {
    const bodyPath = req.body?.url
    if (typeof bodyPath === 'string' && bodyPath) return bodyPath

    const queryPath = req.query?.url
    if (typeof queryPath === 'string' && queryPath) return queryPath
    if (Array.isArray(queryPath) && typeof queryPath[0] === 'string' && queryPath[0]) {
      return queryPath[0]
    }

    return null
  }

  function handleGetFile(req: ApiRequest, res: ApiResponse, {headOnly = false} = {}) {
    const originalFilePath = getFileRequestPath(req)

    if (!originalFilePath) {
      return res.status(400).json({error: 'No file path provided'})
    }

    try {
      const resolvedPath = resolveFilePath(originalFilePath)

      if (!resolvedPath) {
        console.error('File not found:', originalFilePath)
        return res.status(404).json({
          error: 'File not found',
          resolved: false,
        })
      }

      const ext = path.extname(resolvedPath).toLowerCase()
      const contentType = FILE_MIME_TYPES[ext as keyof typeof FILE_MIME_TYPES] || 'application/octet-stream'

      res.setHeader('Content-Type', contentType)
      res.setHeader('Cache-Control', 'public, max-age=86400')
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition')

      if (headOnly) {
        return res.status(200).end()
      }

      res.sendFile(resolvedPath, (err: unknown) => {
        if (!err) return

        if (isClientAbortError(err) || req.aborted || res.writableEnded) {
          return
        }

        console.error('Error sending file:', err)

        if (res.headersSent) return

        try {
          const stats = fs.statSync(resolvedPath)
          const fileStream = fs.createReadStream(resolvedPath)

          fileStream.on('error', (streamErr: Error) => {
            if (!isClientAbortError(streamErr)) {
              console.error('File stream error:', streamErr)
            }
            safeJsonError(res, req, 500, {
              error: 'File stream error',
              details: streamErr.message,
            })
          })

          req.on('close', () => {
            fileStream.destroy()
          })

          res.setHeader('Content-Length', stats.size)
          fileStream.pipe(res)
        } catch (streamErr: unknown) {
          safeJsonError(res, req, 500, {
            error: 'File stream error',
            details: streamErr instanceof Error ? streamErr.message : String(streamErr),
          })
        }
      })
    } catch (err: unknown) {
      console.error('Error processing file:', err)
      safeJsonError(res, req, 500, {error: 'Server error', details: err instanceof Error ? apiErrorMessage(err) : String(err)})
    }
  }

  app.get('/api/get-file', (req: ApiRequest, res: ApiResponse) => {
    handleGetFile(req, res)
  })

  app.head('/api/get-file', (req: ApiRequest, res: ApiResponse) => {
    handleGetFile(req, res, {headOnly: true})
  })

  app.post('/api/get-file', (req: ApiRequest, res: ApiResponse) => {
    handleGetFile(req, res)
  })

  app.post('/api/check-file', (req: ApiRequest, res: ApiResponse) => {
    const filePath = req.body.url

    if (!filePath) {
      return res.json({exists: false, error: 'No path provided'})
    }

    const resolvedPath = resolveFilePath(filePath)
    res.json({
      exists: !!resolvedPath,
    })
  })

  app.post('/api/check-files', async (req: ApiRequest, res: ApiResponse) => {
    const paths = Array.isArray(req.body.paths) ? req.body.paths : []

    if (!paths.length) {
      return res.json({results: {}})
    }

    try {
      const results = await checkFilesExist(paths)
      res.json({results})
    } catch (err: unknown) {
      safeJsonError(res, req, 500, {
        error: 'Batch file check failed',
        details: err instanceof Error ? err.message : String(err),
      })
    }
  })

  app.post('/api/switch-database', async (req: ApiRequest, res: ApiResponse) => {
    const {databaseId} = req.body

    if (!databaseId) {
      return res.status(400).json({error: 'Database ID required'})
    }

    try {
      const database = await getDatabaseManager().switchToDatabase(String(databaseId))

      res.json({
        success: true,
        message: `Database switched to ${database.name}`,
        databaseId: database.id,
        databaseName: database.name,
      })
    } catch (err: unknown) {
      console.error('switch-database failed:', err)
      res.status(500).json({
        error: 'Failed to switch database',
        details: err instanceof Error ? apiErrorMessage(err) : String(err),
      })
    }
  })

  app.post('/api/resolve-path', (req: ApiRequest, res: ApiResponse) => {
    const {filePath} = req.body

    if (!filePath) {
      return res.json({error: 'No file path provided'})
    }

    const resolvedPath = resolveFilePath(filePath)
    const normalizedPath = normalizeMediaPath(filePath)

    const results = []
    for (const dbEntry of config.databases) {
      const cleanPath = normalizedPath
        .replace(/^\/+/, '')
        .replace(/^.*(?:databases|app_storage)[\\/]+[a-f0-9]{12}[\\/]+/i, '')

      const possiblePaths = [
        path.join(databasesPath, dbEntry.id, 'media', cleanPath),
        path.join(databasesPath, dbEntry.id, cleanPath),
        path.join(databasesPath, dbEntry.id, 'meta', cleanPath),
      ]

      for (const possiblePath of possiblePaths) {
        const exists = fs.existsSync(possiblePath)
        if (exists) {
          results.push({
            databaseId: dbEntry.id,
            databaseName: dbEntry.name,
            active: dbEntry.active,
            exists: true,
          })
        }
      }
    }

    res.json({
      exists: !!resolvedPath,
      results,
    })
  })

  router.get('/api/video/:id/playable', async (req: ApiRequest, res: ApiResponse) => {
    if (!transcodeManager) {
      return res.json({
        mode: 'direct',
        url: `/api/video/${req.params.id}?source=direct`,
        transcodeRequired: false,
        transcodeStatus: 'none',
        progress: 100,
        error: null,
      })
    }

    try {
      const resolved = await resolveMediaVideoPath(db, resolveFilePath, paramString(req.params.id))
      if (resolved.error) {
        return res.status(resolved.error.status).json(resolved.error.body)
      }

      if (!resolved.videoPath) {
        return res.status(404).json({message: "Video file doesn't exist"})
      }

      const videoPath = resolved.videoPath

      const plan = await transcodeManager.getPlaybackPlan(videoPath)
      let url = `/api/video/${req.params.id}?source=auto`

      if (plan.streamPlayback) {
        url = `/api/video/${req.params.id}/transcode/stream`
      }

      res.json({
        mode: plan.mode,
        url,
        transcodeRequired: plan.transcodeRequired,
        transcodeEnabled: plan.transcodeEnabled ?? true,
        transcodeStatus: plan.transcodeStatus,
        streamPlayback: plan.streamPlayback,
        progress: plan.progress,
        error: plan.error,
        reason: plan.reason,
        playability: plan.playability,
      })
    } catch (err: unknown) {
      console.error('Playable check error:', err)
      safeJsonError(res, req, 500, {message: err instanceof Error ? apiErrorMessage(err) : String(err) || 'Failed to analyze video'})
    }
  })

  router.delete('/api/transcode/streams', (req: ApiRequest, res: ApiResponse) => {
    if (!transcodeManager) {
      return res.json({stopped: false})
    }

    try {
      transcodeManager.stopAllLiveStreams()
      res.json({stopped: true})
    } catch (err: unknown) {
      console.error('Live transcode stop-all error:', err)
      safeJsonError(res, req, 500, {message: err instanceof Error ? apiErrorMessage(err) : String(err) || 'Failed to stop live transcode streams'})
    }
  })

  router.delete('/api/video/:id/transcode/stream', async (req: ApiRequest, res: ApiResponse) => {
    if (!transcodeManager) {
      return res.json({stopped: false})
    }

    try {
      const resolved = await resolveMediaVideoPath(db, resolveFilePath, paramString(req.params.id))
      if (resolved.error) {
        return res.status(resolved.error.status).json(resolved.error.body)
      }

      if (!resolved.videoPath) {
        return res.status(404).json({message: "Video file doesn't exist"})
      }

      const stopped = transcodeManager.stopLiveStream(resolved.videoPath)
      res.json({stopped})
    } catch (err: unknown) {
      console.error('Live transcode stop error:', err)
      safeJsonError(res, req, 500, {message: err instanceof Error ? apiErrorMessage(err) : String(err) || 'Failed to stop live transcode stream'})
    }
  })

  router.get('/api/video/:id/transcode/stream', async (req: ApiRequest, res: ApiResponse) => {
    if (!transcodeManager) {
      return res.status(503).json({message: 'Transcoding is unavailable'})
    }

    try {
      const resolved = await resolveMediaVideoPath(db, resolveFilePath, paramString(req.params.id))
      if (resolved.error) {
        return res.status(resolved.error.status).json(resolved.error.body)
      }

      if (!resolved.videoPath) {
        return res.status(404).json({message: "Video file doesn't exist"})
      }

      const startTime = Math.max(0, Number(req.query.start) || 0)
      const maxHeightOverride = parseMaxHeightOverride(req.query.maxHeight)
      const streamOptions: { startTime: number; maxHeight?: number } = { startTime }

      if (maxHeightOverride != null) {
        streamOptions.maxHeight = maxHeightOverride
      }

      await transcodeManager.streamLive(req, res, resolved.videoPath, streamOptions)
    } catch (err: unknown) {
      console.error('Live transcode stream error:', err)
      safeJsonError(res, req, 500, {message: err instanceof Error ? apiErrorMessage(err) : String(err) || 'Failed to start live transcode stream'})
    }
  })

  router.get('/api/video/:id/transcode/status', async (req: ApiRequest, res: ApiResponse) => {
    res.setHeader('Deprecation', 'true')
    res.setHeader('Link', `</api/video/${req.params.id}/playable>; rel="successor-version"`)

    if (!transcodeManager) {
      return res.json({
        mode: 'direct',
        transcodeRequired: false,
        transcodeEnabled: true,
        streamPlayback: false,
        status: 'none',
        progress: 100,
        error: null,
        streamUrl: null,
      })
    }

    try {
      const resolved = await resolveMediaVideoPath(db, resolveFilePath, paramString(req.params.id))
      if (resolved.error) {
        return res.status(resolved.error.status).json(resolved.error.body)
      }

      if (!resolved.videoPath) {
        return res.status(404).json({message: "Video file doesn't exist"})
      }

      const status = await transcodeManager.getTranscodeStatus(resolved.videoPath)
      res.json({
        ...status,
        streamUrl: status.streamPlayback
          ? `/api/video/${req.params.id}/transcode/stream`
          : null,
      })
    } catch (err: unknown) {
      console.error('Transcode status error:', err)
      safeJsonError(res, req, 500, {message: err instanceof Error ? apiErrorMessage(err) : String(err) || 'Failed to get transcode status'})
    }
  })

  router.get('/api/transcode/cache', (req: ApiRequest, res: ApiResponse) => {
    if (!transcodeManager) {
      return res.json({bytes: 0, files: 0, entries: 0})
    }

    try {
      res.json(transcodeManager.getCacheStatsForActiveDb())
    } catch (err: unknown) {
      console.error('Transcode cache stats error:', err)
      safeJsonError(res, req, 500, {message: err instanceof Error ? apiErrorMessage(err) : String(err) || 'Failed to read transcode cache stats'})
    }
  })

  router.delete('/api/transcode/cache', (req: ApiRequest, res: ApiResponse) => {
    if (!transcodeManager) {
      return res.json({removed: 0, bytes: 0})
    }

    try {
      const result = transcodeManager.clearCacheForActiveDb()
      res.json(result)
    } catch (err: unknown) {
      console.error('Transcode cache clear error:', err)
      safeJsonError(res, req, 500, {message: err instanceof Error ? apiErrorMessage(err) : String(err) || 'Failed to clear transcode cache'})
    }
  })

  router.get('/api/video/:id', async (req: ApiRequest, res: ApiResponse) => {
    const source = String(req.query.source || 'auto').toLowerCase()

    try {
      const resolved = await resolveMediaVideoPath(db, resolveFilePath, paramString(req.params.id))
      if (resolved.error) {
        return res.status(resolved.error.status).json(resolved.error.body)
      }

      if (!resolved.videoPath) {
        return res.status(404).json({message: "Video file doesn't exist"})
      }

      let streamPath = resolved.videoPath
      let contentType = getStreamContentType(resolved.videoPath)

      if (transcodeManager) {
        const streamInfo = await transcodeManager.resolveStreamPath(resolved.videoPath, source)
        if (streamInfo.filePath) {
          streamPath = streamInfo.filePath
          contentType = streamInfo.contentType || contentType
        } else if (source !== 'direct') {
          return res.status(503).json({
            message: 'Use live transcode stream endpoint for this format',
            mode: 'stream',
            streamUrl: `/api/video/${req.params.id}/transcode/stream`,
            transcodeStatus: streamInfo.plan?.transcodeStatus,
          })
        }
      }

      streamVideoFile(req, res, streamPath, contentType)
    } catch (err: unknown) {
      console.error('Video streaming error:', err)
      safeJsonError(res, req, 500, {message: err instanceof Error ? apiErrorMessage(err) : String(err) || 'Database error'})
    }
  })
}

export { registerBuiltinRoutes }
