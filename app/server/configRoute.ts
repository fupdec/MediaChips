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
import { isSecretSettingOption } from './auth'
import { getAuthService } from './authRegistry'
import { getAllIps, getBestLocalIp } from './network'
import { pickPublicHost } from './publicHost'

function buildGlobalSettingsPayload(config: ServerConfig, hideSecrets = false) {
  const source = config as unknown as Record<string, unknown>
  const payload: Record<string, string> = {}

  for (const key of GLOBAL_APP_CONFIG_KEYS) {
    // /api/config is public (the SPA needs it before login), so credentials
    // like tpdbApiKey are blanked until the client has a session.
    payload[key] = hideSecrets && isSecretSettingOption(key) ? '' : readGlobalConfigString(source, key)
  }

  return payload
}

type ConfigAuth = Pick<ReturnType<typeof getAuthService>, 'isAuthRequired' | 'isRequestAuthenticated'>

async function shouldHideSecrets(req: ApiRequest, authOverride?: ConfigAuth): Promise<boolean> {
  try {
    const auth = authOverride ?? getAuthService()
    return (await auth.isAuthRequired()) && !auth.isRequestAuthenticated(req)
  } catch {
    // Auth not initialised (tests / early boot) — fail closed.
    return true
  }
}

/** SPA boot payload — register next to /api/ping, before static/heavy routes. */
export function registerConfigRoute(
  app: Express,
  config: ServerConfig,
  databasesPath: string,
  authService?: ConfigAuth,
) {
  app.get('/api/config', async (req: ApiRequest, res: ApiResponse) => {
    const hideSecrets = await shouldHideSecrets(req, authService)
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
      ...buildGlobalSettingsPayload(config, hideSecrets),
      ...(typeof config.onboardingCompleted === 'string' ? { onboardingCompleted: config.onboardingCompleted } : {}),
      ...(typeof config.onboardingStep === 'string' ? { onboardingStep: config.onboardingStep } : {}),
      ...(typeof config.onboardingPaused === 'string' ? { onboardingPaused: config.onboardingPaused } : {}),
      ...(typeof config.lastSeenVersion === 'string' ? { lastSeenVersion: config.lastSeenVersion } : {}),
      ...(typeof config.skippedUpdateVersions === 'string' ? { skippedUpdateVersions: config.skippedUpdateVersions } : {}),
      ...(typeof config.seenFeatureHints === 'string' ? { seenFeatureHints: config.seenFeatureHints } : {}),
      ...(typeof config.freeLibraryCapSettled === 'string' ? { freeLibraryCapSettled: config.freeLibraryCapSettled } : {}),
      ...(typeof config.freeLibraryGrandfathered === 'string' ? { freeLibraryGrandfathered: config.freeLibraryGrandfathered } : {}),
    })
  })
}
