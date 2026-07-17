import {
  STASH_COMPONENT_KEYS,
  stashPlugin,
  createStashComponentMap,
  type StashComponentKey,
} from '@mediachips/plugin-stash'
import type {PluginComponentMap} from '@/types/pluginRuntime'

export const stashHostComponentMap: PluginComponentMap = createStashComponentMap({
  [STASH_COMPONENT_KEYS.settingsImportStash]: () =>
    import('@mediachips/plugin-stash/components/SettingsImportStash.vue'),
})

export {
  STASH_COMPONENT_KEYS,
  stashPlugin,
  type StashComponentKey,
}
