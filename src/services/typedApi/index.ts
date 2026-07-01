import { bootstrapApi } from './bootstrap'
import { authApi } from './auth'

const coreApi = {
  ...bootstrapApi,
  ...authApi,
}

type LazyApi = typeof import('./home').homeApi &
  typeof import('./pages').pagesApi &
  typeof import('./media').mediaApi &
  typeof import('./meta').metaApi &
  typeof import('./tasks').tasksApi &
  typeof import('./transcode').transcodeApi

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
  ]).then(([home, pages, media, meta, tasks, transcode]) => ({
    ...home.homeApi,
    ...pages.pagesApi,
    ...media.mediaApi,
    ...meta.metaApi,
    ...tasks.tasksApi,
    ...transcode.transcodeApi,
  }))

  return lazyApiPromise
}

export const typedApi: TypedApi = new Proxy(coreApi as TypedApi, {
  get(target, prop, receiver) {
    if (typeof prop !== 'string' || prop in target) {
      return Reflect.get(target, prop, receiver)
    }

    return (...args: unknown[]) =>
      loadLazyApi().then((api) => {
        const method = api[prop as keyof LazyApi]
        if (typeof method !== 'function') {
          throw new Error(`typedApi.${prop} is not a function`)
        }
        return Reflect.apply(method, api, args)
      })
  },
})
