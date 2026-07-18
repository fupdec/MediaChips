import type {MediaChipsPlugin, PluginApi, PluginManifest} from '@shared/plugins/types'

export const TMDB_COMPONENT_KEYS = {
  settingsTmdb: 'SettingsTmdb',
  dialogTmdbScraper: 'DialogTmdbScraper',
  dialogTmdbPersonScraper: 'DialogTmdbPersonScraper',
} as const

export type TmdbComponentKey =
  (typeof TMDB_COMPONENT_KEYS)[keyof typeof TMDB_COMPONENT_KEYS]

export const TMDB_PLUGIN_ID = 'mediachips.tmdb'

export const tmdbPluginManifest: PluginManifest = {
  id: TMDB_PLUGIN_ID,
  name: 'TMDB scraper',
  version: '0.2.0',
  description:
    'Scrape movie/TV metadata and actor profiles from The Movie Database (TMDB) API.',
  author: 'MediaChips',
  icon: 'movie-search-outline',
  engines: {mediachips: '>=1.0.0'},
  permissions: [
    'ui.settings',
    'ui.dialogs',
    'api.routes',
    'network.external',
    'fs.write',
  ],
}

export function activateTmdbPlugin(api: PluginApi): void {
  api.settings.addPanel({
    tab: 'plugins',
    sectionId: 'settings-tmdb',
    componentKey: TMDB_COMPONENT_KEYS.settingsTmdb,
  })
  api.dialogs.register({
    id: 'tmdbScraper',
    componentKey: TMDB_COMPONENT_KEYS.dialogTmdbScraper,
  })
  api.dialogs.register({
    id: 'tmdbPersonScraper',
    componentKey: TMDB_COMPONENT_KEYS.dialogTmdbPersonScraper,
  })
}

export const tmdbPlugin: MediaChipsPlugin = {
  manifest: tmdbPluginManifest,
  activate: activateTmdbPlugin,
}

export function createTmdbComponentMap<TLoader>(
  loaders: Record<TmdbComponentKey, TLoader>,
): Record<string, TLoader> {
  return {...loaders}
}
