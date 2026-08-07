import { getAuthToken } from '@/services/authSession'

const DEFAULT_MAX_ENTRIES = 1000

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

/** Persist URLs without session tokens so the LRU survives auth. */
export function stripAuthTokenFromUrl(url: string): string {
  const qIndex = url.indexOf('?')
  if (qIndex < 0) return url

  const path = url.slice(0, qIndex)
  const params = new URLSearchParams(url.slice(qIndex + 1))
  if (!params.has('token')) return url

  params.delete('token')
  const next = params.toString()
  return next ? `${path}?${next}` : path
}

/** Re-attach the current session token when reading cached get-file URLs. */
export function withAuthToken(url: string): string {
  const token = getAuthToken()
  if (!token) return url

  const qIndex = url.indexOf('?')
  const path = qIndex < 0 ? url : url.slice(0, qIndex)
  if (!path.includes('get-file')) return url

  const params = new URLSearchParams(qIndex < 0 ? '' : url.slice(qIndex + 1))
  params.set('token', token)
  return `${path}?${params.toString()}`
}

export function getCachedThumb(key: string): string | undefined {
  const url = cache.get(key)
  if (url === undefined) return undefined
  touch(key, url)
  return withAuthToken(url)
}

const isUnavailable = (src: string | null | undefined): boolean => !src || src.includes('unavailable.png')

export function isPersistentThumbUrl(url: string | null | undefined): boolean {
  if (isUnavailable(url)) return false
  const value = String(url)
  if (value.startsWith('blob:')) return false
  return true
}

export function setCachedThumb(key: string, url: string | null | undefined): void {
  if (!isPersistentThumbUrl(url)) return
  touch(key, stripAuthTokenFromUrl(url!))
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
