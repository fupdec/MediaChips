import type {MediaChipsPlugin, PluginApi, PluginManifest} from '@shared/plugins/types'

export const EMBY_COMPONENT_KEYS = {
  settingsImportEmby: 'SettingsImportEmby',
} as const

export type EmbyComponentKey =
  (typeof EMBY_COMPONENT_KEYS)[keyof typeof EMBY_COMPONENT_KEYS]

export const EMBY_PLUGIN_ID = 'mediachips.emby'

export const embyPluginManifest: PluginManifest = {
  id: EMBY_PLUGIN_ID,
  name: 'Emby import',
  version: '0.1.0',
  description:
    'Import movies, episodes, people, genres, studios, series, and chapters from an Emby server.',
  author: 'MediaChips',
  icon: 'television-box',
  engines: {mediachips: '>=1.0.0'},
  permissions: [
    'ui.settings',
    'api.routes',
    'network.external',
  ],
}

export function activateEmbyPlugin(api: PluginApi): void {
  api.settings.addPanel({
    tab: 'plugins',
    sectionId: 'settings-import-emby',
    componentKey: EMBY_COMPONENT_KEYS.settingsImportEmby,
  })
}

export const embyPlugin: MediaChipsPlugin = {
  manifest: embyPluginManifest,
  activate: activateEmbyPlugin,
}

export function createEmbyComponentMap<TLoader>(
  loaders: Record<EmbyComponentKey, TLoader>,
): Record<string, TLoader> {
  return {...loaders}
}
