import type {MediaChipsPlugin, PluginApi, PluginManifest} from '@shared/plugins/types'

export const STASH_COMPONENT_KEYS = {
  settingsImportStash: 'SettingsImportStash',
} as const

export type StashComponentKey =
  (typeof STASH_COMPONENT_KEYS)[keyof typeof STASH_COMPONENT_KEYS]

export const STASH_PLUGIN_ID = 'mediachips.stash'

export const stashPluginManifest: PluginManifest = {
  id: STASH_PLUGIN_ID,
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
}

export function activateStashPlugin(api: PluginApi): void {
  api.settings.addPanel({
    tab: 'plugins',
    sectionId: 'settings-import-stash',
    componentKey: STASH_COMPONENT_KEYS.settingsImportStash,
  })
}

export const stashPlugin: MediaChipsPlugin = {
  manifest: stashPluginManifest,
  activate: activateStashPlugin,
}

export function createStashComponentMap<TLoader>(
  loaders: Record<StashComponentKey, TLoader>,
): Record<string, TLoader> {
  return {...loaders}
}
