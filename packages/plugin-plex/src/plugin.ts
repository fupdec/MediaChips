import type {MediaChipsPlugin, PluginApi, PluginManifest} from '@shared/plugins/types'

export const PLEX_COMPONENT_KEYS = {
  settingsImportPlex: 'SettingsImportPlex',
} as const

export type PlexComponentKey =
  (typeof PLEX_COMPONENT_KEYS)[keyof typeof PLEX_COMPONENT_KEYS]

export const PLEX_PLUGIN_ID = 'mediachips.plex'

export const plexPluginManifest: PluginManifest = {
  id: PLEX_PLUGIN_ID,
  name: 'Plex import',
  version: '0.1.0',
  description:
    'Import movies, episodes, people, genres, studios, series, and chapters from a Plex server.',
  author: 'MediaChips',
  icon: 'play-network',
  engines: {mediachips: '>=1.0.0'},
  permissions: [
    'ui.settings',
    'api.routes',
    'network.external',
  ],
}

export function activatePlexPlugin(api: PluginApi): void {
  api.settings.addPanel({
    tab: 'plugins',
    sectionId: 'settings-import-plex',
    componentKey: PLEX_COMPONENT_KEYS.settingsImportPlex,
  })
}

export const plexPlugin: MediaChipsPlugin = {
  manifest: plexPluginManifest,
  activate: activatePlexPlugin,
}

export function createPlexComponentMap<TLoader>(
  loaders: Record<PlexComponentKey, TLoader>,
): Record<string, TLoader> {
  return {...loaders}
}
