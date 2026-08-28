import type { Express } from 'express'
import type { ApiRequest, ApiResponse } from '../../api/types/http'
import type { ServerConfig, ServerDatabaseEntry } from '../types/server'
import path from 'path'
import packageJson from '../../package.json'
import {
  GLOBAL_APP_CONFIG_KEYS,
  readGlobalConfigString,
  readMinimizeToTrayConfig,
} from '../../shared/appGlobalConfig'
import { isLanAccessEnabled, isLanAccessEnvLocked } from './lanAccess'
import { getAllIps, getBestLocalIp } from './network'
import { pickPublicHost } from './publicHost'

function buildGlobalSettingsPayload(config: ServerConfig) {
  const source = config as unknown as Record<string, unknown>
  const payload: Record<string, string> = {}

  for (const key of GLOBAL_APP_CONFIG_KEYS) {
    payload[key] = readGlobalConfigString(source, key)
  }

  return payload
}

/** SPA boot payload — register next to /api/ping, before static/heavy routes. */
export function registerConfigRoute(
  app: Express,
  config: ServerConfig,
  databasesPath: string,
) {
  app.get('/api/config', (req: ApiRequest, res: ApiResponse) => {
    console.log('Config request from:', req.headers.origin || 'unknown origin')

    const activeDb = config.databases.find((dbEntry: ServerDatabaseEntry) => dbEntry.active)
    const frontendIp = pickPublicHost(
      {getBestLocalIp, getAllIps},
      {requestHostname: req.hostname},
    )

    res.json({
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
      ...(typeof config.seenFeatureHints === 'string' ? { seenFeatureHints: config.seenFeatureHints } : {}),
    })
  })
}
