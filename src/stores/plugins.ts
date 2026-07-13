import {defineStore} from 'pinia'
import type {
  PluginCatalogEntry,
  PluginDialogContribution,
  PluginSettingsNavContribution,
  PluginSettingsPanelContribution,
} from '@shared/plugins'
import {BUILTIN_PLUGIN_IDS} from '@shared/plugins'
import {getPluginRegistry} from '@/services/pluginRegistry'
import {
  activatePlugin,
  bootstrapPlugins,
  deactivatePlugin,
  parseEnabledPlugins,
  serializeEnabledPlugins,
} from '@/services/pluginHost'
import {setOption} from '@/services/settingsService'
import {useSettingsStore} from '@/stores/settings'

function syncFromRegistry() {
  const snapshot = getPluginRegistry().snapshot()
  return {
    catalog: snapshot.catalog,
    settingsNav: snapshot.settingsNav,
    settingsPanels: snapshot.settingsPanels,
    dialogs: snapshot.dialogs,
    revision: getPluginRegistry().getRevision(),
  }
}

export const usePluginsStore = defineStore('usePluginsStore', {
  state: () => ({
    ...syncFromRegistry(),
    bootstrapped: false,
  }),
  getters: {
    plannedCount: (state) => state.catalog.filter((entry) => entry.state === 'planned').length,
    installedCount: (state) => state.catalog.filter((entry) =>
      entry.state === 'installed'
      || entry.state === 'enabled'
      || entry.state === 'disabled'
      || entry.state === 'error',
    ).length,
    enabledCount: (state) => state.catalog.filter((entry) => entry.enabled).length,
    isAdultEnabled: (state) => Boolean(
      state.catalog.find((entry) => entry.manifest.id === BUILTIN_PLUGIN_IDS.adult)?.enabled,
    ),
    enabledPluginIds: (state) => state.catalog
      .filter((entry) => entry.enabled)
      .map((entry) => entry.manifest.id),
  },
  actions: {
    refresh() {
      Object.assign(this, syncFromRegistry())
    },
    async bootstrap() {
      const settingsStore = useSettingsStore()
      const enabled = parseEnabledPlugins(settingsStore.enabledPlugins)
      await bootstrapPlugins(enabled)
      this.bootstrapped = true
      this.refresh()
    },
    async persistEnabled() {
      const settingsStore = useSettingsStore()
      const value = serializeEnabledPlugins(this.enabledPluginIds)
      await setOption(value, 'enabledPlugins')
      settingsStore.enabledPlugins = value
    },
    async setEnabled(pluginId: string, enabled: boolean) {
      if (enabled) {
        await activatePlugin(pluginId)
      } else {
        await deactivatePlugin(pluginId)
      }
      this.refresh()
      await this.persistEnabled()
    },
  },
})

export default usePluginsStore

export type {
  PluginCatalogEntry,
  PluginDialogContribution,
  PluginSettingsNavContribution,
  PluginSettingsPanelContribution,
}
