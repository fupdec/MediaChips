import {
  EMBY_COMPONENT_KEYS,
  embyPlugin,
  createEmbyComponentMap,
} from '@mediachips/plugin-emby'

export const embyHostComponentMap = createEmbyComponentMap({
  [EMBY_COMPONENT_KEYS.settingsImportEmby]: () =>
    import('@mediachips/plugin-emby/components/SettingsImportEmby.vue'),
})

export {
  EMBY_COMPONENT_KEYS,
  embyPlugin,
  type EmbyComponentKey,
} from '@mediachips/plugin-emby'
