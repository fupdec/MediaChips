import {
  ADULT_COMPONENT_KEYS,
  adultPlugin,
  createAdultComponentMap,
  type AdultComponentKey,
} from '@mediachips/plugin-adult'
import type {PluginComponentMap} from '@/types/pluginRuntime'

/**
 * Host wiring: adult UI (settings + scrape dialogs) lives in the plugin package.
 */
export const adultHostComponentMap: PluginComponentMap = createAdultComponentMap({
  [ADULT_COMPONENT_KEYS.settingsDataScraper]: () =>
    import('@mediachips/plugin-adult/components/SettingsDataScraper.vue'),
  [ADULT_COMPONENT_KEYS.dialogScraper]: () =>
    import('@mediachips/plugin-adult/components/DialogScraper.vue'),
  [ADULT_COMPONENT_KEYS.dialogScraperMultiple]: () =>
    import('@mediachips/plugin-adult/components/DialogScraperMultiple.vue'),
  [ADULT_COMPONENT_KEYS.dialogSceneScraper]: () =>
    import('@mediachips/plugin-adult/components/DialogSceneScraper.vue'),
  [ADULT_COMPONENT_KEYS.dialogSceneScraperMultiple]: () =>
    import('@mediachips/plugin-adult/components/DialogSceneScraperMultiple.vue'),
})

export {
  ADULT_COMPONENT_KEYS,
  adultPlugin,
  type AdultComponentKey,
}
