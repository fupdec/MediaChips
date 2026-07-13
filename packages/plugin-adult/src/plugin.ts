import type {MediaChipsPlugin, PluginApi, PluginManifest} from '../../shared/plugins/types'

/**
 * Stable component keys registered by this plugin.
 * The host (or a later self-contained build) supplies loaders for these keys.
 */
export const ADULT_COMPONENT_KEYS = {
  settingsDataScraper: 'SettingsDataScraper',
  dialogScraper: 'DialogScraper',
  dialogScraperMultiple: 'DialogScraperMultiple',
  dialogSceneScraper: 'DialogSceneScraper',
  dialogSceneScraperMultiple: 'DialogSceneScraperMultiple',
} as const

export type AdultComponentKey =
  (typeof ADULT_COMPONENT_KEYS)[keyof typeof ADULT_COMPONENT_KEYS]

export const ADULT_PLUGIN_ID = 'mediachips.adult'

export const adultPluginManifest: PluginManifest = {
  id: ADULT_PLUGIN_ID,
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
}

export function activateAdultPlugin(api: PluginApi): void {
  api.settings.addNavItem({
    value: 'adult',
    icon: 'mdi-shield-alert-outline',
    labelKey: 'settings.tabs.adult',
    descKey: 'settings.tabs_desc.adult',
    docId: 'settings-doc-tab-adult',
  })

  api.settings.addPanel({
    tab: 'adult',
    sectionId: 'settings-adult-scraper',
    componentKey: ADULT_COMPONENT_KEYS.settingsDataScraper,
  })

  api.dialogs.register({
    id: 'scraper',
    componentKey: ADULT_COMPONENT_KEYS.dialogScraper,
  })
  api.dialogs.register({
    id: 'scraperMultiple',
    componentKey: ADULT_COMPONENT_KEYS.dialogScraperMultiple,
  })
  api.dialogs.register({
    id: 'sceneScraper',
    componentKey: ADULT_COMPONENT_KEYS.dialogSceneScraper,
  })
  api.dialogs.register({
    id: 'sceneScraperMultiple',
    componentKey: ADULT_COMPONENT_KEYS.dialogSceneScraperMultiple,
  })
}

export const adultPlugin: MediaChipsPlugin = {
  manifest: adultPluginManifest,
  activate: activateAdultPlugin,
}

/**
 * Build a component map from host-provided loaders.
 * Keeps this package free of app-relative `@/` imports so it can live in another repo.
 */
export function createAdultComponentMap<TLoader>(
  loaders: Record<AdultComponentKey, TLoader>,
): Record<string, TLoader> {
  return {...loaders}
}
