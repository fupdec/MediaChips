import type { ServerDatabaseEntry, NetworkIpInfo } from './types/server'
import type { ResolveFilePathFn } from './types/builtinRoutes'
import {projectPath} from '../shared/projectRoot'
import type { TranscodeManager } from './types/builtinRoutes'
import dotenv from 'dotenv'
import path from 'path'
import { apiErrorMessage } from '../api/types/errors'
import { getBestLocalIp, getAllIps } from './server/network'
import { initializeServerConfig } from './server/serverConfig'
import { setupDatabase } from './server/database'
import { createExpressApp, setupStaticApp } from './server/createApp'
import { initAuthService, getAuthService } from './server/authRegistry'
import { createAuthMiddleware, registerAuthRoutes } from './server/auth'
import { registerPingRoute } from './server/pingRoute'
import { registerConfigRoute } from './server/configRoute'
import { proEntitlementPath, syncProEntitlement } from './server/proEntitlement'
import { attachLogDir, initAppLog } from './server/appLog'
import { registerLogRoutes } from './server/logRoute'
import {
  DEFAULT_EVENT_LOOP_BLOCK_MS,
  DEFAULT_SLOW_REQUEST_MS,
  createSlowRequestLogger,
  parseThresholdMs,
  startEventLoopLagMonitor,
} from './server/slowRequestLog'
import packageJson from '../package.json'
import { createServerStarter } from './server/startup'
import {
  initLanAccess,
  registerServerNetworkDeps,
  syncNetworkConfig,
  isLanAccessEnabled,
} from './server/lanAccess'

dotenv.config({
  path: projectPath('.env'),
})

initAppLog('server', packageJson.version)
// Electron (and Docker) pass the data folder up front, so even an early crash leaves a log on disk.
const earlyDataDir = process.env.MEDIA_CHIPS_DATA_DIR?.trim()
if (earlyDataDir) attachLogDir(path.join(path.resolve(earlyDataDir), 'logs'))

const startupStartedAt = Date.now()
const logStartup = (message: string) => {
  console.log(`[startup] ${message} (+${Date.now() - startupStartedAt}ms)`)
}

const networkHelpers = {
  getBestLocalIp,
  getAllIps: getAllIps as () => NetworkIpInfo[],
}

logStartup('config init')
const {config, configPath, databasesPath} = initializeServerConfig(networkHelpers)
// Restore Pro access state if config.json was lost or rebuilt.
syncProEntitlement(config as unknown as Record<string, unknown>, proEntitlementPath(configPath))
attachLogDir(path.join(path.dirname(databasesPath), 'logs'))

const dbConfig = config.databases.find((i: ServerDatabaseEntry) => i.active)
logStartup('database open')
const {db} = setupDatabase({databasesPath, dbConfig})

const {app, router} = createExpressApp()
// Slow responses and event loop stalls go to logs/server.log (Settings → About shows it).
// MEDIA_CHIPS_SLOW_REQUEST_MS / MEDIA_CHIPS_EVENT_LOOP_BLOCK_MS override the thresholds; 0 disables.
app.use(createSlowRequestLogger({
  thresholdMs: parseThresholdMs(process.env.MEDIA_CHIPS_SLOW_REQUEST_MS, DEFAULT_SLOW_REQUEST_MS),
  log: message => console.warn(message),
}))
startEventLoopLagMonitor({
  thresholdMs: parseThresholdMs(process.env.MEDIA_CHIPS_EVENT_LOOP_BLOCK_MS, DEFAULT_EVENT_LOOP_BLOCK_MS),
  log: message => console.warn(message),
})
const authService = initAuthService(db, {dataDir: path.dirname(databasesPath)})
authService.applyPendingPasswordReset(true)
app.use(createAuthMiddleware(authService))
registerAuthRoutes(app, authService)

// Answer Electron waitForBackend / SPA boot before loading Task/face/transcode graphs.
registerPingRoute(app, config)
registerConfigRoute(app, config, databasesPath, undefined, proEntitlementPath(configPath))
registerLogRoutes(app)
logStartup('ping+config ready')

const {startServer, restartNetworkListener, bindShutdownHandler, getListener} = createServerStarter({
  app,
  config,
  configPath,
  databasesPath,
})

let resolveFilePath: ResolveFilePathFn = () => null

function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

async function registerHeavyRoutes() {
  const heavyStartedAt = Date.now()

  // Serve home/tag thumbs ASAP — UI requests /api/get-file right after shell reveal.
  // Register get-file BEFORE static/SPA so ?url= is not stripped by history fallback.
  const { createFileResolver } = require('./server/fileResolver') as typeof import('./server/fileResolver')
  const fileResolver = createFileResolver({config, databasesPath})
  resolveFilePath = fileResolver.resolveFilePath
  const {getStreamContentType} = fileResolver

  const { registerGetFileRoutes } = require('./server/getFileRoutes') as typeof import('./server/getFileRoutes')
  registerGetFileRoutes({app, db, resolveFilePath, trustedRoots: [databasesPath]})
  setupStaticApp(app)
  logStartup(`get-file+static ready (${Date.now() - heavyStartedAt}ms)`)
  await yieldEventLoop()

  const { registerApiRoutes } = require('./server/registerRoutes') as typeof import('./server/registerRoutes')
  const routeLoadErrors = await registerApiRoutes(app, db, {
    afterRoute: async (routeFile) => {
      if (routeFile === 'Setting.routes') {
        logStartup('settings routes ready')
        await yieldEventLoop()
      }
    },
  })
  logStartup(`api routes registered (${Date.now() - heavyStartedAt}ms)`)

  const { createTranscodeManager } = require('../api/services/transcode/transcodeService') as typeof import('../api/services/transcode/transcodeService')
  const transcodeManager = createTranscodeManager({
    databasesPath,
    db,
    getActiveDbId: () => config.databases.find((entry: ServerDatabaseEntry) => entry.active)?.id || null,
  }) as unknown as TranscodeManager

  const { createDatabaseManager } = require('./server/databaseManager') as typeof import('./server/databaseManager')
  const { initDatabaseManager } = require('./server/databaseRegistry') as typeof import('./server/databaseRegistry')
  const { invalidateMediaDerivedCaches } = require('../api/services/mediaCacheInvalidation') as typeof import('../api/services/mediaCacheInvalidation')

  const databaseManager = createDatabaseManager({
    db,
    config,
    configPath,
    databasesPath,
    transcodeManager,
    onDatabaseChanged: () => {
      invalidateMediaDerivedCaches()
      try {
        getAuthService().invalidateSettingsCache()
      } catch {
        // auth service may not be initialized yet during startup
      }
    },
  })
  initDatabaseManager(databaseManager)

  const { registerBuiltinRoutes } = require('./server/builtinRoutes') as typeof import('./server/builtinRoutes')
  registerBuiltinRoutes({
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
  })

  try {
    const listener = getListener()
    if (!listener) {
      throw new Error('HTTP listener missing when registering WebSockets')
    }
    const registerWebSockets = require('./tasks/websockets').default as typeof import('./tasks/websockets').default
    // Pass the live server — expressWs(app) without it orphans WS on a dead http.Server.
    registerWebSockets(app, db, listener)
  } catch (err: unknown) {
    console.log('\x1b[33m%s\x1b[0m', '⚠️ WebSocket module not found:', err instanceof Error ? apiErrorMessage(err) : String(err))
  }

  logStartup(`full api ready (${Date.now() - heavyStartedAt}ms heavy phase)`)
}

async function rebindWebSocketsAfterListenerRestart(): Promise<void> {
  const listener = getListener()
  if (!listener) return
  try {
    const {attachWebSocketsToServer} = require('./tasks/websockets') as typeof import('./tasks/websockets')
    attachWebSocketsToServer(app, listener)
  } catch (err: unknown) {
    console.log(
      '\x1b[33m%s\x1b[0m',
      '⚠️ WebSocket rebind failed:',
      err instanceof Error ? apiErrorMessage(err) : String(err),
    )
  }
}

async function bootstrapServer() {
  await initLanAccess(db, networkHelpers, config)
  syncNetworkConfig(config, isLanAccessEnabled(), networkHelpers)

  registerServerNetworkDeps({
    config,
    configPath,
    ...networkHelpers,
    restartListener: async () => {
      await restartNetworkListener()
      await rebindWebSocketsAfterListenerRestart()
    },
  })

  bindShutdownHandler()
  await startServer()
  logStartup('listening (ping available)')
  void warnIfLanWithoutPassword()

  // Let Electron's /api/ping poll complete before blocking on heavy requires.
  await yieldEventLoop()
  await registerHeavyRoutes()
}

async function warnIfLanWithoutPassword(): Promise<void> {
  try {
    if (isLanAccessEnabled() && !(await authService.isAuthRequired())) {
      console.warn('\x1b[33m%s\x1b[0m', '⚠️  LAN access is on without a password: anyone on this network can browse and change your library. Enable password protection in Settings → Security.')
    }
  } catch {
    // diagnostics only
  }
}

bootstrapServer().catch((err: unknown) => {
  console.error('Failed to start server:', err instanceof Error ? apiErrorMessage(err) : String(err))
  process.exit(1)
})

global.serverConfig = config
global.serverApp = app

const serverExports = {
  config,
  app,
  get listener() {
    return getListener()
  },
  get resolveFilePath() {
    return resolveFilePath
  },
}

export default serverExports
export { config, app, resolveFilePath }
