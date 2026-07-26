type CatalogLoader = () => void | Promise<void>
type CatalogListener = () => void

let loader: CatalogLoader | null = null
const listeners = new Set<CatalogListener>()

export function registerMetaCatalogLoader(fn: CatalogLoader) {
  loader = fn
  return () => {
    if (loader === fn) loader = null
  }
}

export function onMetaCatalogChanged(listener: CatalogListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notifyListeners() {
  for (const listener of listeners) {
    try {
      listener()
    } catch (error) {
      console.error('meta catalog listener failed:', error)
    }
  }
}

/** Reload appStore.meta from API, then notify dependents. */
export async function reloadMetaCatalog() {
  await loader?.()
  notifyListeners()
}

/** Catalog already updated in store — only notify dependents. */
export function notifyMetaCatalogChanged() {
  notifyListeners()
}
