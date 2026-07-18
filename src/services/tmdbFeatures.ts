import {BUILTIN_PLUGIN_IDS} from '@shared/plugins'
import {getPluginRegistry} from '@/services/pluginRegistry'
import {usePluginsStore} from '@/stores/plugins'
import {useSettingsStore} from '@/stores/settings'
import type {Meta} from '@/types/stores'

export function isTmdbPluginEnabled(): boolean {
  try {
    return usePluginsStore().enabledPluginIds.includes(BUILTIN_PLUGIN_IDS.tmdb)
  } catch {
    return getPluginRegistry().isEnabled(BUILTIN_PLUGIN_IDS.tmdb)
  }
}

export function isTmdbUiAvailable(): boolean {
  return isTmdbPluginEnabled()
}

type AssignedScraperRow = {
  metaId?: number | null
  scraper?: string | null
}

const TMDB_PERSON_NAME_RE = /^(cast|performers|акт[её]ры)$/iu

/** True when this tag category is the configured TMDB Cast/person category. */
export function isTmdbPersonCategory(
  meta?: Meta | null,
  assigned?: AssignedScraperRow[] | null,
): boolean {
  if (!meta?.id) return false
  if (meta.type != null && meta.type !== 'array') return false

  const metaId = Number(meta.id)

  if (assigned?.some((row) => Number(row.metaId) === metaId && row.scraper === 'tmdb_cast')) {
    return true
  }

  try {
    const settingsStore = useSettingsStore()
    const configured = Number(settingsStore.tmdbPersonMetaId)
    if (Number.isFinite(configured) && configured > 0 && metaId === configured) {
      return true
    }
  } catch {
    // settings store may be unavailable outside app context
  }

  return TMDB_PERSON_NAME_RE.test(String(meta.name || '').trim())
}
