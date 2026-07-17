import {BUILTIN_PLUGIN_IDS, type PluginCatalogEntry} from '@shared/plugins'
import {isSfwBuild} from '../buildFlags'

/** Bundled adult plugin — present in direct builds, can be disabled from UI. */
export function createBundledAdultCatalogEntry(enabled = true): PluginCatalogEntry {
  return {
    manifest: {
      id: BUILTIN_PLUGIN_IDS.adult,
      name: 'Adult features',
      version: '0.1.0',
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
    source: 'bundled',
    state: enabled ? 'enabled' : 'disabled',
    uiEntry: '@mediachips/plugin-adult',
    mainEntry: null,
    error: null,
    enabled,
  }
}

/** Bundled Stash import plugin. */
export function createBundledStashCatalogEntry(enabled = true): PluginCatalogEntry {
  return {
    manifest: {
      id: BUILTIN_PLUGIN_IDS.stash,
      name: 'Stash import',
      version: '0.1.0',
      description:
        'Import scenes, performers, studios, tags, and markers from a Stash database (stash-go.sqlite).',
      author: 'MediaChips',
      icon: 'database-import',
      engines: {mediachips: '>=1.0.0'},
      permissions: [
        'ui.settings',
        'api.routes',
        'fs.read',
      ],
    },
    source: 'bundled',
    state: enabled ? 'enabled' : 'disabled',
    uiEntry: '@mediachips/plugin-stash',
    mainEntry: null,
    error: null,
    enabled,
  }
}

export function createBundledPluginCatalog(
  enabledPlugins: string[] = [BUILTIN_PLUGIN_IDS.adult, BUILTIN_PLUGIN_IDS.stash],
): PluginCatalogEntry[] {
  if (isSfwBuild()) return []

  return [
    createBundledAdultCatalogEntry(enabledPlugins.includes(BUILTIN_PLUGIN_IDS.adult)),
    createBundledStashCatalogEntry(enabledPlugins.includes(BUILTIN_PLUGIN_IDS.stash)),
  ]
}

/** Active plugin catalog (bundled only until external install lands). */
export function createPluginCatalog(
  enabledPlugins: string[] = [BUILTIN_PLUGIN_IDS.adult, BUILTIN_PLUGIN_IDS.stash],
): PluginCatalogEntry[] {
  return createBundledPluginCatalog(enabledPlugins)
}
