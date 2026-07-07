import type { ServerDatabaseEntry, NetworkIpInfo } from './types/server'
import type { TranscodeManager } from './types/builtinRoutes'
import { apiErrorMessage } from '../api/types/errors'
import { getBestLocalIp, getAllIps } from './server/network'
import { initializeServerConfig } from './server/serverConfig'
import { setupDatabase } from './server/database'
import { createExpressApp, setupStaticApp } from './server/createApp'
import { initAuthService, getAuthService } from './server/authRegistry'
import { createAuthMiddleware, registerAuthRoutes } from './server/auth'
import { registerApiRoutes } from './server/registerRoutes'
import { createFileResolver } from './server/fileResolver'
import { registerBuiltinRoutes } from './server/builtinRoutes'
import { createServerStarter } from './server/startup'
import {
  initLanAccess,
  registerServerNetworkDeps,
  syncNetworkConfig,
  isLanAccessEnabled,
} from './server/lanAccess'
import { createDatabaseManager } from './server/databaseManager'
import { initDatabaseManager } from './server/databaseRegistry'
import { invalidateMediaDerivedCaches } from '../api/services/mediaCacheInvalidation'
import { createTranscodeManager } from '../api/services/transcode/transcodeService'
import registerWebSockets from './tasks/websockets'

const networkHelpers = {
  getBestLocalIp,
  getAllIps: getAllIps as () => NetworkIpInfo[],
}

const {config, configPath, databasesPath} = initializeServerConfig(networkHelpers)

const dbConfig = config.databases.find((i: ServerDatabaseEntry) => i.active)
const {db} = setupDatabase({databasesPath, dbConfig})

const {app, router} = createExpressApp()
const authService = initAuthService(db)
app.use(createAuthMiddleware(authService))
registerAuthRoutes(app, authService)

const routeLoadErrors = registerApiRoutes(app, db)

const {resolveFilePath, getStreamContentType} = createFileResolver({config, databasesPath})

const transcodeManager = createTranscodeManager({
  databasesPath,
  db,
  getActiveDbId: () => config.databases.find((entry: ServerDatabaseEntry) => entry.active)?.id || null,
}) as unknown as TranscodeManager

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

setupStaticApp(app)

try {
  registerWebSockets(app, db)
} catch (err: unknown) {
  console.log('\x1b[33m%s\x1b[0m', '⚠️ WebSocket module not found:', err instanceof Error ? apiErrorMessage(err) : String(err))
}

const {startServer, restartNetworkListener, bindShutdownHandler, getListener} = createServerStarter({
  app,
  config,
  configPath,
  databasesPath,
})

async function bootstrapServer() {
  await initLanAccess(db, networkHelpers, config)
  syncNetworkConfig(config, isLanAccessEnabled(), networkHelpers)

  registerServerNetworkDeps({
    config,
    configPath,
    ...networkHelpers,
    restartListener: restartNetworkListener,
  })

  bindShutdownHandler()
  await startServer()
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
  resolveFilePath,
}

export default serverExports
export { config, app, resolveFilePath }
