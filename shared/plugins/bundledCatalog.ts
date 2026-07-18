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
      icon: 'package-variant',
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

/** Bundled Jellyfin import plugin. */
export function createBundledJellyfinCatalogEntry(enabled = true): PluginCatalogEntry {
  return {
    manifest: {
      id: BUILTIN_PLUGIN_IDS.jellyfin,
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
    },
    source: 'bundled',
    state: enabled ? 'enabled' : 'disabled',
    uiEntry: '@mediachips/plugin-jellyfin',
    mainEntry: null,
    error: null,
    enabled,
  }
}

/** Bundled Plex import plugin. */
export function createBundledPlexCatalogEntry(enabled = true): PluginCatalogEntry {
  return {
    manifest: {
      id: BUILTIN_PLUGIN_IDS.plex,
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
    },
    source: 'bundled',
    state: enabled ? 'enabled' : 'disabled',
    uiEntry: '@mediachips/plugin-plex',
    mainEntry: null,
    error: null,
    enabled,
  }
}

/** Bundled Emby import plugin (Jellyfin-compatible API). */
export function createBundledEmbyCatalogEntry(enabled = true): PluginCatalogEntry {
  return {
    manifest: {
      id: BUILTIN_PLUGIN_IDS.emby,
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
    },
    source: 'bundled',
    state: enabled ? 'enabled' : 'disabled',
    uiEntry: '@mediachips/plugin-emby',
    mainEntry: null,
    error: null,
    enabled,
  }
}

/** Bundled TMDB movie scraper (official API). */
export function createBundledTmdbCatalogEntry(enabled = true): PluginCatalogEntry {
  return {
    manifest: {
      id: BUILTIN_PLUGIN_IDS.tmdb,
      name: 'TMDB scraper',
      version: '0.1.0',
      description:
        'Scrape movie metadata from The Movie Database (TMDB) API by title, TMDB id, or IMDb id.',
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
    },
    source: 'bundled',
    state: enabled ? 'enabled' : 'disabled',
    uiEntry: '@mediachips/plugin-tmdb',
    mainEntry: null,
    error: null,
    enabled,
  }
}

const DEFAULT_BUNDLED_PLUGIN_IDS = [
  BUILTIN_PLUGIN_IDS.adult,
  BUILTIN_PLUGIN_IDS.stash,
  BUILTIN_PLUGIN_IDS.jellyfin,
  BUILTIN_PLUGIN_IDS.plex,
  BUILTIN_PLUGIN_IDS.emby,
  BUILTIN_PLUGIN_IDS.tmdb,
]

export function createBundledPluginCatalog(
  enabledPlugins: string[] = DEFAULT_BUNDLED_PLUGIN_IDS,
): PluginCatalogEntry[] {
  const tmdbEntry = createBundledTmdbCatalogEntry(
    enabledPlugins.includes(BUILTIN_PLUGIN_IDS.tmdb),
  )

  if (isSfwBuild()) {
    return [tmdbEntry]
  }

  return [
    createBundledAdultCatalogEntry(enabledPlugins.includes(BUILTIN_PLUGIN_IDS.adult)),
    createBundledStashCatalogEntry(enabledPlugins.includes(BUILTIN_PLUGIN_IDS.stash)),
    createBundledJellyfinCatalogEntry(enabledPlugins.includes(BUILTIN_PLUGIN_IDS.jellyfin)),
    createBundledPlexCatalogEntry(enabledPlugins.includes(BUILTIN_PLUGIN_IDS.plex)),
    createBundledEmbyCatalogEntry(enabledPlugins.includes(BUILTIN_PLUGIN_IDS.emby)),
    tmdbEntry,
  ]
}

/** Active plugin catalog (bundled only until external install lands). */
export function createPluginCatalog(
  enabledPlugins: string[] = DEFAULT_BUNDLED_PLUGIN_IDS,
): PluginCatalogEntry[] {
  return createBundledPluginCatalog(enabledPlugins)
}
