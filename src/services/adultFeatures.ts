import {BUILTIN_PLUGIN_IDS} from '@shared/plugins'
import {getPluginRegistry} from '@/services/pluginRegistry'
import {usePluginsStore} from '@/stores/plugins'
import {useSettingsStore} from '@/stores/settings'

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
 * Requires both the adult plugin and the privacy switch.
 */
export function isAdultUiAvailable(): boolean {
  const settingsStore = useSettingsStore()
  return isAdultPluginEnabled() && settingsStore.showAdultContent === '1'
}
