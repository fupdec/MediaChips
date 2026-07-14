import {BUILTIN_PLUGIN_IDS} from '@shared/plugins'
import {getPluginRegistry} from '@/services/pluginRegistry'
import {usePluginsStore} from '@/stores/plugins'

/** Plugin pack is installed and enabled. Prefers Pinia when available for reactivity. */
export function isAdultPluginEnabled(): boolean {
  try {
    return usePluginsStore().isAdultEnabled
  } catch {
    return getPluginRegistry().isEnabled(BUILTIN_PLUGIN_IDS.adult)
  }
}

/**
 * Adult scrape UI (menus, dialogs, editing buttons).
 * Requires the adult plugin to be enabled in Settings → Plugins.
 */
export function isAdultUiAvailable(): boolean {
  return isAdultPluginEnabled()
}
