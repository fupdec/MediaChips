const DEFAULT_MAX_ENTRIES = 1500

const cache = new Map<string, string>()
const maxEntries = DEFAULT_MAX_ENTRIES

function touch(key: string, url: string): void {
  cache.delete(key)
  cache.set(key, url)
}

function evictOldest(): void {
  if (cache.size <= maxEntries) return
  const oldestKey = cache.keys().next().value
  if (oldestKey !== undefined) cache.delete(oldestKey)
}

export function getCachedThumb(key: string): string | undefined {
  const url = cache.get(key)
  if (url === undefined) return undefined
  touch(key, url)
  return url
}

const isUnavailable = (src: string | null | undefined): boolean => !src || src.includes('unavailable.png')

export function isPersistentThumbUrl(url: string | null | undefined): boolean {
  if (isUnavailable(url)) return false
  const value = String(url)
  if (value.startsWith('blob:')) return false
  if (value.includes('token=')) return false
  return true
}

export function setCachedThumb(key: string, url: string | null | undefined): void {
  if (!isPersistentThumbUrl(url)) return
  touch(key, url!)
  evictOldest()
}

export function invalidateCachedThumb(key: string): void {
  cache.delete(key)
}

export function invalidateVideoThumbCaches(id: number | string): void {
  invalidateCachedThumb(mediaThumbKey('videos', id, 'thumbs'))
  invalidateCachedThumb(mediaThumbKey('videos', id, 'grids'))
}

export function setCachedMediaThumbs(
  folder: string,
  thumbs: Record<string | number, string>,
): void {
  for (const [id, url] of Object.entries(thumbs)) {
    const key = folder === 'videos'
      ? mediaThumbKey(folder, id, 'thumbs')
      : mediaThumbKey(folder, id)
    setCachedThumb(key, url)
  }
}

export function setCachedTagThumbs(
  metaId: number | string,
  thumbs: Record<string | number, Record<string, string>>,
): void {
  for (const [tagId, typeMap] of Object.entries(thumbs)) {
    for (const [type, url] of Object.entries(typeMap)) {
      setCachedThumb(tagThumbKey(metaId, tagId, type), url)
    }
  }
}

export function clearThumbDisplayCache(): void {
  cache.clear()
}

export function mediaThumbKey(
  folder: string,
  id: number | string,
  subfolder?: 'thumbs' | 'grids',
): string {
  if (subfolder) {
    return `media:${folder}:${subfolder}:${id}`
  }
  return `media:${folder}:${id}`
}

export function tagThumbKey(
  metaId: number | string,
  tagId: number | string,
  type: string,
): string {
  return `tag:${metaId}:${tagId}:${type}`
}
