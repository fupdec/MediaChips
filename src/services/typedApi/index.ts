import { bootstrapApi } from './bootstrap'
import { authApi } from './auth'
import { systemApi } from './system'

const coreApi = {
  ...bootstrapApi,
  ...authApi,
  ...systemApi,
}

type LazyApi = typeof import('./home').homeApi &
  typeof import('./pages').pagesApi &
  typeof import('./media').mediaApi &
  typeof import('./meta').metaApi &
  typeof import('./tasks').tasksApi &
  typeof import('./transcode').transcodeApi &
  typeof import('./plugins').pluginsApi &
  typeof import('./browse').browseApi &
  typeof import('./localAi').localAiApi &
  typeof import('./backfill').backfillApi &
  typeof import('./imports').importsApi &
  typeof import('./scrapers').scrapersApi &
  typeof import('./tmdb').tmdbApi &
  typeof import('./libraryReset').libraryResetApi

type CoreApi = typeof coreApi

export type TypedApi = CoreApi & LazyApi

let lazyApiPromise: Promise<LazyApi> | null = null

function loadLazyApi(): Promise<LazyApi> {
  lazyApiPromise ??= Promise.all([
    import('./home'),
    import('./pages'),
    import('./media'),
    import('./meta'),
    import('./tasks'),
    import('./transcode'),
    import('./plugins'),
    import('./browse'),
    import('./localAi'),
    import('./backfill'),
    import('./imports'),
    import('./scrapers'),
    import('./tmdb'),
    import('./libraryReset'),
  ]).then(([
    home, pages, media, meta, tasks, transcode, plugins, browse, localAi, backfill, imports, scrapers, tmdb, libraryReset,
  ]) => ({
    ...home.homeApi,
    ...pages.pagesApi,
    ...media.mediaApi,
    ...meta.metaApi,
    ...tasks.tasksApi,
    ...transcode.transcodeApi,
    ...plugins.pluginsApi,
    ...browse.browseApi,
    ...localAi.localAiApi,
    ...backfill.backfillApi,
    ...imports.importsApi,
    ...scrapers.scrapersApi,
    ...tmdb.tmdbApi,
    ...libraryReset.libraryResetApi,
  }))

  return lazyApiPromise
}

export const typedApi: TypedApi = new Proxy(coreApi as TypedApi, {
  get(target, prop, receiver) {
    if (typeof prop !== 'string' || prop in target) {
      return Reflect.get(target, prop, receiver)
    }

    return (...args: unknown[]) =>
      loadLazyApi().then(async (api) => {
        let method = api[prop as keyof LazyApi]
        // HMR can leave a stale lazy bundle in memory — retry once with a fresh load.
        if (typeof method !== 'function') {
          lazyApiPromise = null
          const fresh = await loadLazyApi()
          method = fresh[prop as keyof LazyApi]
          if (typeof method !== 'function') {
            throw new Error(`typedApi.${prop} is not a function`)
          }
          return Reflect.apply(method, fresh, args)
        }
        return Reflect.apply(method, api, args)
      })
  },
})
