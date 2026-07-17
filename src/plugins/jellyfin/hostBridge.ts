import {
  JELLYFIN_COMPONENT_KEYS,
  jellyfinPlugin,
  createJellyfinComponentMap,
} from '@mediachips/plugin-jellyfin'

export const jellyfinHostComponentMap = createJellyfinComponentMap({
  [JELLYFIN_COMPONENT_KEYS.settingsImportJellyfin]: () =>
    import('@mediachips/plugin-jellyfin/components/SettingsImportJellyfin.vue'),
})

export {
  JELLYFIN_COMPONENT_KEYS,
  jellyfinPlugin,
  type JellyfinComponentKey,
} from '@mediachips/plugin-jellyfin'
