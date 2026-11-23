/**
 * Short-lived per-library cache for dashboard queries that cost 200 ms or more on a big library
 * and are asked for again on every visit to Home. Cleared with the other media caches.
 */
type Entry = {expiresAt: number; value: unknown}

const registry = new Set<{clear: () => void}>()

export function createDbTtlCache(ttlMs: number, now: () => number = Date.now) {
  let store = new WeakMap<object, Map<string, Entry>>()

  const cache = {
    /** Returns the cached value or computes it; a rejected promise is not kept. */
    get<T>(db: object, key: string, compute: () => T): T {
      let perDb = store.get(db)
      if (!perDb) {
        perDb = new Map()
        store.set(db, perDb)
      }
      const hit = perDb.get(key)
      if (hit && hit.expiresAt > now()) return hit.value as T

      const value = compute()
      const entry: Entry = {expiresAt: now() + ttlMs, value}
      perDb.set(key, entry)
      if (value instanceof Promise) {
        value.catch(() => { if (perDb!.get(key) === entry) perDb!.delete(key) })
      }
      return value
    },
    clear() {
      store = new WeakMap()
    },
  }
  registry.add(cache)
  return cache
}

export function clearDbTtlCaches(): void {
  for (const cache of registry) cache.clear()
}
