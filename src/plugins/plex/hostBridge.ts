import {
  PLEX_COMPONENT_KEYS,
  plexPlugin,
  createPlexComponentMap,
} from '@mediachips/plugin-plex'

export const plexHostComponentMap = createPlexComponentMap({
  [PLEX_COMPONENT_KEYS.settingsImportPlex]: () =>
    import('@mediachips/plugin-plex/components/SettingsImportPlex.vue'),
})

export {
  PLEX_COMPONENT_KEYS,
  plexPlugin,
  type PlexComponentKey,
} from '@mediachips/plugin-plex'
