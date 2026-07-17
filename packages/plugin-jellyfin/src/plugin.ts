import type {MediaChipsPlugin, PluginApi, PluginManifest} from '@shared/plugins/types'

export const JELLYFIN_COMPONENT_KEYS = {
  settingsImportJellyfin: 'SettingsImportJellyfin',
} as const

export type JellyfinComponentKey =
  (typeof JELLYFIN_COMPONENT_KEYS)[keyof typeof JELLYFIN_COMPONENT_KEYS]

export const JELLYFIN_PLUGIN_ID = 'mediachips.jellyfin'

export const jellyfinPluginManifest: PluginManifest = {
  id: JELLYFIN_PLUGIN_ID,
  name: 'Jellyfin import',
  version: '0.1.0',
  description:
    'Import movies, episodes, people, genres, studios, series, and chapters from a Jellyfin server.',
  author: 'MediaChips',
  icon: 'server',
  engines: {mediachips: '>=1.0.0'},
  permissions: [
    'ui.settings',
    'api.routes',
    'network.external',
  ],
}

export function activateJellyfinPlugin(api: PluginApi): void {
  api.settings.addPanel({
    tab: 'plugins',
    sectionId: 'settings-import-jellyfin',
    componentKey: JELLYFIN_COMPONENT_KEYS.settingsImportJellyfin,
  })
}

export const jellyfinPlugin: MediaChipsPlugin = {
  manifest: jellyfinPluginManifest,
  activate: activateJellyfinPlugin,
}

export function createJellyfinComponentMap<TLoader>(
  loaders: Record<JellyfinComponentKey, TLoader>,
): Record<string, TLoader> {
  return {...loaders}
}
