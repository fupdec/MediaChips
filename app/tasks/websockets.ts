import type {ApiDb} from '../../api/types/db'
import type {Express} from 'express'
import type {Server} from 'http'
import expressWs from 'express-ws'
import {registerMovingWebSocket} from './movingWsHandler'
import {registerWatcherWebSocket} from './watcherWsHandler'
import type {ExpressWithWs} from '../types/websockets'

type ExpressWsHandle = {
  getWss: () => {close: (callback?: (err?: Error) => void) => void}
}

let routesRegistered = false
let wsHandle: ExpressWsHandle | null = null

function closeCurrentWsServer(): void {
  if (!wsHandle) return
  try {
    wsHandle.getWss().close()
  } catch {
    // Previous listener may already be closed during LAN rebind.
  }
  wsHandle = null
}

/**
 * Attach express-ws to the live HTTP server.
 * Must run after listen() — calling expressWs(app) with no server creates an
 * orphan http.Server and breaks /moving + /watcher upgrades.
 */
export function attachWebSocketsToServer(app: Express, server: Server): ExpressWsHandle {
  if (!server) {
    throw new Error('HTTP server is required to attach WebSockets')
  }

  closeCurrentWsServer()
  wsHandle = expressWs(app, server)
  return wsHandle
}

function registerWebSockets(app: Express, db: ApiDb, server: Server): ExpressWsHandle {
  const handle = attachWebSocketsToServer(app, server)
  const wsApp = app as ExpressWithWs

  if (!routesRegistered) {
    registerWatcherWebSocket(wsApp, db)
    registerMovingWebSocket(wsApp, db)
    routesRegistered = true
  }

  return handle
}

/** Test helper — reset module singletons between cases. */
export function resetWebSocketsForTests(): void {
  closeCurrentWsServer()
  routesRegistered = false
}

export default registerWebSockets
