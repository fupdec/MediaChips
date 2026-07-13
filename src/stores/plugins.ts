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
import {apiClient} from '@/services/apiClient'

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
    installing: false,
    installError: null as string | null,
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
    async installFromPath(sourcePath: string) {
      this.installing = true
      this.installError = null
      try {
        const {data} = await apiClient.post<PluginCatalogEntry>('/api/Plugin/install', {
          path: sourcePath,
        })
        await this.bootstrap()
        return data
      } catch (error: unknown) {
        const message = (error as {response?: {data?: {message?: string}}})?.response?.data?.message
          || (error instanceof Error ? error.message : String(error))
        this.installError = message
        throw error
      } finally {
        this.installing = false
      }
    },
    async uninstall(pluginId: string) {
      await apiClient.post('/api/Plugin/uninstall', {id: pluginId})
      if (this.enabledPluginIds.includes(pluginId)) {
        await deactivatePlugin(pluginId)
        await this.persistEnabled()
      }
      await this.bootstrap()
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
