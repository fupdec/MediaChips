const DEFAULT_MAX_ENTRIES = 400

const cache = new Map<string, string>()
const tagThumbVersions = new Map<string, number>()
const maxEntries = DEFAULT_MAX_ENTRIES

function tagVersionKey(metaId: number | string, tagId: number | string): string {
  return `tagver:${metaId}:${tagId}`
}

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

const TAG_THUMB_TYPES = ['main', 'alt', 'custom1', 'custom2', 'avatar', 'header'] as const

export function invalidateTagThumbCaches(
  metaId: number | string,
  tagId: number | string,
): void {
  for (const type of TAG_THUMB_TYPES) {
    invalidateCachedThumb(tagThumbKey(metaId, tagId, type))
  }
}

export function setTagThumbVersion(
  metaId: number | string,
  tagId: number | string,
  version = Date.now(),
): number {
  tagThumbVersions.set(tagVersionKey(metaId, tagId), version)
  return version
}

export function getTagThumbVersion(
  metaId: number | string,
  tagId: number | string,
): number | undefined {
  return tagThumbVersions.get(tagVersionKey(metaId, tagId))
}

export function clearTagThumbVersion(
  metaId: number | string,
  tagId: number | string,
): void {
  tagThumbVersions.delete(tagVersionKey(metaId, tagId))
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
    const version = getTagThumbVersion(metaId, tagId)
    for (const [type, url] of Object.entries(typeMap)) {
      // After a tag image edit, refuse to re-cache stale stable URLs from
      // in-flight prefetch that resolved before the version bump.
      if (version && !String(url).includes('_t=')) continue
      setCachedThumb(tagThumbKey(metaId, tagId, type), url)
    }
  }
}

export function clearThumbDisplayCache(): void {
  cache.clear()
  tagThumbVersions.clear()
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
