import type { Express } from 'express'
import type { ApiRequest, ApiResponse } from '../../api/types/http'
import type { ServerConfig } from '../types/server'

/** Minimal readiness probe — register before heavy route graphs load. */
export function registerPingRoute(app: Express, config: ServerConfig) {
  app.get('/api/ping', (_req: ApiRequest, res: ApiResponse) => {
    res.json({
      pong: Date.now(),
      ip: 'localhost',
      port: config.port,
      message: 'Server is online',
    })
  })
}
