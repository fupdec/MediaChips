import type {ApiDb} from '../../../../api/types/db'
import {createSettingsRepository} from '../../../../api/db/repositories/settings'

export function resolveTmdbApiKey(db?: ApiDb | null): string {
  const serverConfig = (globalThis as {serverConfig?: Record<string, unknown>}).serverConfig
  const fromConfig = typeof serverConfig?.tmdbApiKey === 'string' ? serverConfig.tmdbApiKey.trim() : ''
  if (fromConfig) return fromConfig

  const fromDb = db
    ? String(createSettingsRepository(db.drizzle).findByOption('tmdbApiKey')?.value || '').trim()
    : ''
  if (fromDb) return fromDb

  return String(process.env.TMDB_API_KEY || '').trim()
}

export function isTmdbConfigured(db?: ApiDb | null): boolean {
  return resolveTmdbApiKey(db).length > 0
}
