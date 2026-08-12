import type { ServerDatabaseEntry, NetworkIpInfo } from './types/server'
import type { ResolveFilePathFn } from './types/builtinRoutes'
import {projectPath} from '../shared/projectRoot'
import type { TranscodeManager } from './types/builtinRoutes'
import dotenv from 'dotenv'
import { apiErrorMessage } from '../api/types/errors'
import { getBestLocalIp, getAllIps } from './server/network'
import { initializeServerConfig } from './server/serverConfig'
import { setupDatabase } from './server/database'
import { createExpressApp, setupStaticApp } from './server/createApp'
import { initAuthService, getAuthService } from './server/authRegistry'
import { createAuthMiddleware, registerAuthRoutes } from './server/auth'
import { registerPingRoute } from './server/pingRoute'
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

const dbConfig = config.databases.find((i: ServerDatabaseEntry) => i.active)
logStartup('database open')
const {db} = setupDatabase({databasesPath, dbConfig})

const {app, router} = createExpressApp()
const authService = initAuthService(db)
app.use(createAuthMiddleware(authService))
registerAuthRoutes(app, authService)

// Answer Electron waitForBackend before loading Task/face/transcode graphs.
registerPingRoute(app, config)
logStartup('ping ready')

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
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createFileResolver } = require('./server/fileResolver') as typeof import('./server/fileResolver')
  const fileResolver = createFileResolver({config, databasesPath})
  resolveFilePath = fileResolver.resolveFilePath
  const {getStreamContentType} = fileResolver

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { registerGetFileRoutes } = require('./server/getFileRoutes') as typeof import('./server/getFileRoutes')
  registerGetFileRoutes({app, db, resolveFilePath})
  setupStaticApp(app)
  logStartup(`get-file+static ready (${Date.now() - heavyStartedAt}ms)`)
  await yieldEventLoop()

  // eslint-disable-next-line @typescript-eslint/no-require-imports
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

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createTranscodeManager } = require('../api/services/transcode/transcodeService') as typeof import('../api/services/transcode/transcodeService')
  const transcodeManager = createTranscodeManager({
    databasesPath,
    db,
    getActiveDbId: () => config.databases.find((entry: ServerDatabaseEntry) => entry.active)?.id || null,
  }) as unknown as TranscodeManager

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createDatabaseManager } = require('./server/databaseManager') as typeof import('./server/databaseManager')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { initDatabaseManager } = require('./server/databaseRegistry') as typeof import('./server/databaseRegistry')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
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

  // eslint-disable-next-line @typescript-eslint/no-require-imports
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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

  // Let Electron's /api/ping poll complete before blocking on heavy requires.
  await yieldEventLoop()
  await registerHeavyRoutes()
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
