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
  ENABLED_PLUGINS_SCHEMA_VERSION,
  resolveEnabledPluginsForBootstrap,
  serializeEnabledPlugins,
} from '@/services/pluginHost'
import {useSettingsStore} from '@/stores/settings'
import {typedApi} from '@/services/typedApi'

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
      const resolved = resolveEnabledPluginsForBootstrap(
        settingsStore.enabledPlugins,
        settingsStore.enabledPluginsSchemaVersion,
      )
      await bootstrapPlugins(resolved.ids)
      this.bootstrapped = true
      this.refresh()
      if (resolved.didMigrate) {
        settingsStore.enabledPluginsSchemaVersion = String(resolved.schemaVersion)
        await this.persistEnabled()
      }
    },
    async persistEnabled() {
      const settingsStore = useSettingsStore()
      const value = serializeEnabledPlugins(this.enabledPluginIds)
      // Persist directly so enable state is flushed even if the app restarts
      // before the short per-key debounce in setOption would fire.
      settingsStore.enabledPlugins = value
      await typedApi.putSetting('enabledPlugins', value)
      const schemaVersion = String(
        settingsStore.enabledPluginsSchemaVersion || ENABLED_PLUGINS_SCHEMA_VERSION,
      )
      settingsStore.enabledPluginsSchemaVersion = schemaVersion
      await typedApi.putSetting('enabledPluginsSchemaVersion', schemaVersion)
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
        const {data} = await typedApi.installPlugin(sourcePath)
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
      await typedApi.uninstallPlugin(pluginId)
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
