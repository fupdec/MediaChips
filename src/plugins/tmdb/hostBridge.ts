import {
  TMDB_COMPONENT_KEYS,
  tmdbPlugin,
  createTmdbComponentMap,
} from '@mediachips/plugin-tmdb'
import type {PluginComponentMap} from '@/types/pluginRuntime'

export const tmdbHostComponentMap: PluginComponentMap = createTmdbComponentMap({
  [TMDB_COMPONENT_KEYS.settingsTmdb]: () =>
    import('@mediachips/plugin-tmdb/components/SettingsTmdb.vue'),
  [TMDB_COMPONENT_KEYS.dialogTmdbScraper]: () =>
    import('@mediachips/plugin-tmdb/components/DialogTmdbScraper.vue'),
  [TMDB_COMPONENT_KEYS.dialogTmdbPersonScraper]: () =>
    import('@mediachips/plugin-tmdb/components/DialogTmdbPersonScraper.vue'),
}) as PluginComponentMap

export {
  TMDB_COMPONENT_KEYS,
  tmdbPlugin,
  type TmdbComponentKey,
} from '@mediachips/plugin-tmdb'
