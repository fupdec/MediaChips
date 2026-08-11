import type { ApiDb, MediaLike } from '../../api/types/db'
import type { ApiRequest, ApiResponse } from '../../api/types/http'
import { apiErrorMessage, paramString } from '../../api/types/errors'
import type {
  BuiltinRoutesOptions,
  FileResolverResult,
  ResolveFilePathFn,
} from '../types/builtinRoutes'
import type { ServerConfig, ServerDatabaseEntry } from '../types/server'
import path from 'path'
import fs from 'fs'
import { createMediaRepository } from '../../api/db/repositories/media'
import { normalizeMediaPath } from '../../api/utils/normalizeUserPath'
import {
  isLanAccessEnabled,
  isLanAccessEnvLocked,
  applyLanAccessChange,
  didLanAccessChange,
} from './lanAccess'
import { pickPublicHost } from './publicHost'
import { listMediaRoots } from '../../api/services/mediaRoots'
import { listBrowseDirectory } from '../../api/services/browseDirectory'
import { listSystemPlaces } from '../../api/services/systemPlaces'
import { getBestLocalIp, getAllIps } from './network'
import { saveConfigFile } from './configFile'
import { safeJsonError } from './fileResolver'
import { streamVideoFile } from '../../api/services/transcode/streamVideoFile'
import { parseMaxHeightOverride } from '../../api/services/transcode/transcodeSettings'
import { getDatabaseManager } from './databaseRegistry'
import { createStorageDirectories } from './serverConfig'
import packageJson from '../../package.json'
import { parseBooleanSetting } from '../../shared/parseBooleanSetting'
import {
  GLOBAL_APP_CONFIG_KEYS,
  readGlobalConfigString,
  readMinimizeToTrayConfig,
} from '../../shared/appGlobalConfig'
function buildGlobalSettingsPayload(config: ServerConfig) {
  const source = config as unknown as Record<string, unknown>
  const payload: Record<string, string> = {}

  for (const key of GLOBAL_APP_CONFIG_KEYS) {
    payload[key] = readGlobalConfigString(source, key)
  }

  return payload
}

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

  /**
   * Escape hatch for phones stuck on a cached PWA shell.
   * Served under /api/ so existing service workers (navigateFallbackDenylist)
   * fetch it from the network instead of rewriting to index.html.
   */
  app.get('/api/clear-cache', (_req: ApiRequest, res: ApiResponse) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
  <meta name="theme-color" content="#9875c6"/>
  <title>MediaChips — clear cache</title>
  <style>
    body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#f5f3fa;color:#2c2940;text-align:center}
    .card{max-width:26rem;padding:1.5rem;border-radius:16px;background:#fff;box-shadow:0 8px 28px rgba(80,70,140,.12)}
    h1{font-size:1.15rem;margin:0 0 .5rem}
    p{margin:0 0 1rem;color:#5c5870;font-size:.92rem;line-height:1.4}
    button{appearance:none;border:0;border-radius:999px;padding:.7rem 1.2rem;background:#9875c6;color:#fff;font:inherit;font-weight:600}
    .ok{color:#2f6b3a}
  </style>
</head>
<body>
  <div class="card">
    <h1>Refresh MediaChips</h1>
    <p id="status">Clearing offline cache…</p>
    <button id="go" type="button" hidden>Open app</button>
  </div>
  <script>
    (async function () {
      var status = document.getElementById('status')
      var go = document.getElementById('go')
      try {
        if ('serviceWorker' in navigator) {
          var regs = await navigator.serviceWorker.getRegistrations()
          await Promise.all(regs.map(function (r) { return r.unregister() }))
        }
        if ('caches' in window) {
          var keys = await caches.keys()
          await Promise.all(keys.map(function (k) { return caches.delete(k) }))
        }
        status.textContent = 'Cache cleared. Opening app…'
        status.className = 'ok'
      } catch (e) {
        status.textContent = 'Could not clear everything. Tap below to open the app anyway.'
      }
      var target = '/?_nocache=' + Date.now()
      go.hidden = false
      go.onclick = function () { location.replace(target) }
      setTimeout(function () { location.replace(target) }, 400)
    })()
  </script>
</body>
</html>`)
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

  app.get('/api/media-roots', (_req: ApiRequest, res: ApiResponse) => {
    res.json({
      roots: listMediaRoots(),
      configured: Boolean(process.env.MEDIA_CHIPS_MEDIA_ROOTS?.trim())
        || listMediaRoots().length > 0,
    })
  })

  app.post('/api/browse/listDirectory', async (req: ApiRequest, res: ApiResponse) => {
    try {
      const result = await listBrowseDirectory(req.body?.path, {
        extensions: req.body?.extensions,
        showHidden: Boolean(req.body?.showHidden),
        mediaRepo: createMediaRepository(db.drizzle),
      })

      res.json(result)
    } catch (error: unknown) {
      const status = Number((error as {status?: number})?.status) || 500
      const message = apiErrorMessage(error) || 'Failed to list directory'
      res.status(status).json({message})
    }
  })

  app.get('/api/browse/places', (_req: ApiRequest, res: ApiResponse) => {
    const explicitRoots = process.env.MEDIA_CHIPS_MEDIA_ROOTS?.trim()
    // Electron sets MEDIA_CHIPS_DATA_DIR for userData; only real containers
    // should restrict browsing to /media mounts.
    const container = Boolean(process.env.MEDIA_CHIPS_DATA_DIR?.trim())
      && process.env.ELECTRON_RUN_AS_NODE !== '1'

    if (explicitRoots || container) {
      res.json({
        container,
        places: listMediaRoots().map((root) => ({
          id: `media:${root.path}`,
          path: root.path,
          name: root.name,
          icon: 'mdi-harddisk',
        })),
      })
      return
    }

    res.json({container: false, places: listSystemPlaces()})
  })

  app.get('/api/config', (req: ApiRequest, res: ApiResponse) => {
    console.log('Config request from:', req.headers.origin || 'unknown origin')

    const activeDb = config.databases.find((dbEntry: ServerDatabaseEntry) => dbEntry.active)
    const frontendIp = pickPublicHost(
      {getBestLocalIp, getAllIps},
      {requestHostname: req.hostname},
    )

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
      minimizeToTray: readMinimizeToTrayConfig(config as unknown as Record<string, unknown>),
      ...buildGlobalSettingsPayload(config),
      ...(typeof config.onboardingCompleted === 'string' ? { onboardingCompleted: config.onboardingCompleted } : {}),
      ...(typeof config.onboardingStep === 'string' ? { onboardingStep: config.onboardingStep } : {}),
      ...(typeof config.onboardingPaused === 'string' ? { onboardingPaused: config.onboardingPaused } : {}),
      ...(typeof config.lastSeenVersion === 'string' ? { lastSeenVersion: config.lastSeenVersion } : {}),
      ...(typeof config.skippedUpdateVersions === 'string' ? { skippedUpdateVersions: config.skippedUpdateVersions } : {}),
    }

    res.json(responseConfig)
  })

  app.post('/api/update-config', async (req: ApiRequest, res: ApiResponse) => {
    const previousAllowLanAccess = config.allowLanAccess
    const lanAccessInPayload = Boolean(req.body && 'allowLanAccess' in req.body)
      && !isLanAccessEnvLocked()

    Object.assign(config, req.body)

    if (Array.isArray(req.body?.databases)) {
      createStorageDirectories(config, databasesPath)
    }

    const activeDb = config.databases.find((dbEntry: ServerDatabaseEntry) => dbEntry.active)
    if (activeDb) {
      config.path = path.join(databasesPath, activeDb.id)
    }

    try {
      // Saving unrelated global keys (e.g. zoom) still includes allowLanAccess.
      // Only rebind the HTTP listener when the LAN flag actually changes.
      if (
        lanAccessInPayload
        && didLanAccessChange(previousAllowLanAccess, req.body.allowLanAccess)
      ) {
        const enabled = parseBooleanSetting(req.body.allowLanAccess, true)
        config.allowLanAccess = enabled ? '1' : '0'
        await applyLanAccessChange(enabled)
      } else {
        if (lanAccessInPayload) {
          config.allowLanAccess = parseBooleanSetting(req.body.allowLanAccess, true) ? '1' : '0'
        }
        saveConfigFile(configPath, config)
      }

      console.log('\x1b[36m%s\x1b[0m', `Config updated. Active database: ${activeDb?.name || 'none'}`)
      res.json({success: true, message: 'Configuration updated'})
    } catch (error: unknown) {
      console.error('Failed to update config:', error)
      res.status(500).json({
        success: false,
        message: apiErrorMessage(error) || 'Failed to update configuration',
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
        remuxCopy: plan.remuxCopy === true,
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
      const copyCodecs = req.query.copy === '1' || req.query.copy === 'true'
      const accurateSeek = req.query.accurate === '1' || req.query.accurate === 'true'
      const streamOptions: {
        startTime: number
        maxHeight?: number
        copyCodecs?: boolean
        accurateSeek?: boolean
      } = {startTime}

      if (maxHeightOverride != null) {
        streamOptions.maxHeight = maxHeightOverride
      }
      if (copyCodecs) {
        streamOptions.copyCodecs = true
      }
      if (accurateSeek) {
        streamOptions.accurateSeek = true
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
