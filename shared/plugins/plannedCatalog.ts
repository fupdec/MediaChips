import type {PluginCatalogEntry} from './types'

/**
 * Future plugins that are not loadable yet.
 * Bundled plugins (e.g. adult) must not appear here — they live in bundledCatalog.
 */
export function createPlannedPluginCatalog(): PluginCatalogEntry[] {
  return [
    {
      manifest: {
        id: 'mediachips.nfoImport',
        name: 'NFO / Kodi import',
        version: '0.0.0',
        description: 'Import titles, posters, and ratings from NFO sidecars and Kodi-style folders.',
        author: 'MediaChips',
        icon: 'file-document-outline',
        engines: {mediachips: '>=1.0.0'},
        requiresAdult: false,
        permissions: ['ui.settings', 'fs.read', 'fs.write'],
      },
      source: 'planned',
      state: 'planned',
      uiEntry: null,
      mainEntry: null,
      error: null,
      enabled: false,
    },
    {
      manifest: {
        id: 'mediachips.jellyfinSync',
        name: 'Jellyfin sync',
        version: '0.0.0',
        description: 'Sync libraries and watch state with a Jellyfin server.',
        author: 'MediaChips',
        icon: 'server-network',
        engines: {mediachips: '>=1.0.0'},
        requiresAdult: false,
        permissions: ['ui.settings', 'network.external'],
      },
      source: 'planned',
      state: 'planned',
      uiEntry: null,
      mainEntry: null,
      error: null,
      enabled: false,
    },
  ]
}
