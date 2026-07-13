import {
  BUILTIN_PLUGIN_IDS,
  type PluginCatalogEntry,
} from './types'

/** Placeholder catalog until real plugin packages are loadable. */
export function createPlannedPluginCatalog(): PluginCatalogEntry[] {
  return [
    {
      manifest: {
        id: BUILTIN_PLUGIN_IDS.adult,
        name: 'Adult features',
        version: '0.0.0',
        description:
          'Performer and scene scrapers, ThePornDB integration, and related adult tools.',
        author: 'MediaChips',
        icon: 'shield-alert',
        engines: {mediachips: '>=1.0.0'},
        requiresAdult: true,
        permissions: [
          'ui.settings',
          'ui.menu',
          'ui.dialogs',
          'api.routes',
          'network.external',
          'fs.write',
        ],
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
