import type { ApiDb } from '../../../../api/types/db'
import { createSettingsRepository } from '../../../../api/db/repositories/settings'
import { BUILTIN_PLUGIN_IDS } from '../../../../shared/plugins/types'

export type TpdbApiKeySource = 'settings' | 'env' | null

export function pickTpdbApiKey(
  configValue?: string | null,
  dbValue?: string | null,
  envValue?: string | null,
): {key: string; source: TpdbApiKeySource} {
  const fromConfig = String(configValue || '').trim()
  if (fromConfig) {
    return {key: fromConfig, source: 'settings'}
  }

  const fromDb = String(dbValue || '').trim()
  if (fromDb) {
    return {key: fromDb, source: 'settings'}
  }

  const fromEnv = String(envValue || '').trim()
  if (fromEnv) {
    return {key: fromEnv, source: 'env'}
  }

  return {key: '', source: null}
}

function readGlobalConfigTpdbApiKey(): string | null {
  const serverConfig = (globalThis as {serverConfig?: Record<string, unknown>}).serverConfig
  const value = serverConfig?.tpdbApiKey
  return typeof value === 'string' ? value : null
}

export function resolveTpdbApiKey(db?: ApiDb | null): {
  key: string
  source: TpdbApiKeySource
} {
  const dbValue = db
    ? createSettingsRepository(db.drizzle).findByOption('tpdbApiKey')?.value
    : null

  return pickTpdbApiKey(
    readGlobalConfigTpdbApiKey(),
    dbValue,
    process.env.TPDB_API_KEY,
  )
}

export function isTpdbConfigured(db?: ApiDb | null): boolean {
  return resolveTpdbApiKey(db).key.length > 0
}

export function isAdultPluginEnabled(db: ApiDb): boolean {
  const row = createSettingsRepository(db.drizzle).findByOption('enabledPlugins')
  const raw = String(row?.value ?? '["mediachips.adult"]').trim()

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return false
    return parsed.map(String).includes(BUILTIN_PLUGIN_IDS.adult)
  } catch {
    return raw.includes(BUILTIN_PLUGIN_IDS.adult)
  }
}

export function tpdbKeyMissingMessage(): string {
  return 'ThePornDB API key is not configured. Add it in Settings → Adult, or set TPDB_API_KEY in the environment.'
}

export function adultPluginDisabledMessage(): string {
  return 'Adult plugin is disabled. Enable mediachips.adult in Settings → Plugins.'
}
