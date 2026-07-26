type CatalogLoader = () => void | Promise<void>
type CatalogListener = () => void

function createAppCatalog(name: string) {
  let loader: CatalogLoader | null = null
  const listeners = new Set<CatalogListener>()

  function notifyListeners() {
    for (const listener of listeners) {
      try {
        listener()
      } catch (error) {
        console.error(`${name} catalog listener failed:`, error)
      }
    }
  }

  return {
    registerLoader(fn: CatalogLoader) {
      loader = fn
      return () => {
        if (loader === fn) loader = null
      }
    },
    onChanged(listener: CatalogListener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async reload() {
      await loader?.()
      notifyListeners()
    },
    notifyChanged() {
      notifyListeners()
    },
  }
}

const tags = createAppCatalog('tags')
const tabs = createAppCatalog('tabs')
const playlists = createAppCatalog('playlists')
const mediaTypes = createAppCatalog('mediaTypes')

export const registerTagsCatalogLoader = tags.registerLoader
export const onTagsCatalogChanged = tags.onChanged
export const reloadTagsCatalog = tags.reload
export const notifyTagsCatalogChanged = tags.notifyChanged

export const registerTabsCatalogLoader = tabs.registerLoader
export const onTabsCatalogChanged = tabs.onChanged
export const reloadTabsCatalog = tabs.reload
export const notifyTabsCatalogChanged = tabs.notifyChanged

export const registerPlaylistsCatalogLoader = playlists.registerLoader
export const onPlaylistsCatalogChanged = playlists.onChanged
export const reloadPlaylistsCatalog = playlists.reload
export const notifyPlaylistsCatalogChanged = playlists.notifyChanged

export const registerMediaTypesCatalogLoader = mediaTypes.registerLoader
export const onMediaTypesCatalogChanged = mediaTypes.onChanged
export const reloadMediaTypesCatalog = mediaTypes.reload
export const notifyMediaTypesCatalogChanged = mediaTypes.notifyChanged
