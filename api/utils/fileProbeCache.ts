import {stat} from 'fs/promises'
import path from 'path'

/** Reuse expensive probes across import, system dates, thumbnails and grids. */
export function createFileProbeCache<T>(probe: (filePath: string) => Promise<T>, {
  ttlMs = 120_000,
  maxEntries = 256,
} = {}) {
  const entries = new Map<string, {signature: string; expires: number; result: Promise<T>}>()

  return async (filePath: string): Promise<T> => {
    // Non-filesystem inputs still use the original probe (e.g. stream URLs).
    const stats = await stat(filePath).catch(() => null)
    if (!stats) return probe(filePath)
    const key = path.resolve(filePath)
    const signature = `${stats.dev}:${stats.ino}:${stats.size}:${stats.mtimeMs}:${stats.ctimeMs}`
    const now = Date.now()
    const existing = entries.get(key)
    if (existing && existing.signature === signature && existing.expires > now) {
      return structuredClone(await existing.result)
    }

    for (const [cachedKey, entry] of entries) {
      if (entry.expires <= now) entries.delete(cachedKey)
    }
    while (entries.size >= maxEntries && entries.size) {
      entries.delete(entries.keys().next().value!)
    }
    const entry = {signature, expires: now + ttlMs, result: probe(filePath)}
    entries.set(key, entry)
    try {
      const result = await entry.result
      entry.expires = Date.now() + ttlMs
      return structuredClone(result)
    } catch (error) {
      if (entries.get(key) === entry) entries.delete(key)
      throw error
    }
  }
}
