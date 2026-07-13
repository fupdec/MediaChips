import type {MediaChipsPlugin, PluginApi, PluginManifest} from '@shared/plugins/types'

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
  version: '0.0.0-sfw',
  description: 'Unavailable in SFW builds.',
  author: 'MediaChips',
  icon: 'shield-alert',
  engines: {mediachips: '>=1.0.0'},
  requiresAdult: true,
  permissions: [],
}

export function activateAdultPlugin(_api: PluginApi): void {
  // no-op — adult plugin stripped from SFW / App Store builds
}

export function createAdultComponentMap(
  _loaders: Partial<Record<AdultComponentKey, () => Promise<unknown>>>,
): Record<string, () => Promise<unknown>> {
  return {}
}

export const adultPlugin: MediaChipsPlugin = {
  manifest: adultPluginManifest,
  activate: activateAdultPlugin,
}
