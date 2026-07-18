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

/** True when this tag category is the configured TMDB Cast/person category. */
export function isTmdbPersonCategory(meta?: Meta | null): boolean {
  if (!meta?.id || meta.type !== 'array') return false
  try {
    const settingsStore = useSettingsStore()
    const configured = Number(settingsStore.tmdbPersonMetaId)
    if (Number.isFinite(configured) && configured > 0) {
      return Number(meta.id) === configured
    }
  } catch {
    // settings store may be unavailable outside app context
  }
  return /^(cast|performers)$/i.test(String(meta.name || ''))
}
