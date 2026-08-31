import {
  MEDIA_TYPE_VIDEO,
  MEDIA_TYPE_IMAGE,
  MEDIA_TYPE_AUDIO,
  MEDIA_TYPE_TEXT,
  type MediaType,
  type MediaTypeFilterParam,
} from '@/types/media'

export {
  MEDIA_TYPE_VIDEO,
  MEDIA_TYPE_IMAGE,
  MEDIA_TYPE_AUDIO,
  MEDIA_TYPE_TEXT,
}

export const normalizeMediaTypeKey = (value: unknown): string =>
  String(value || '').trim().toLowerCase()

export const getMediaTypeKey = (mediaType: MediaType | null | undefined): string =>
  normalizeMediaTypeKey(mediaType?.type || mediaType?.name)

export const isVideoMediaType = (mediaType: MediaType | null | undefined): boolean =>
  getMediaTypeKey(mediaType) === MEDIA_TYPE_VIDEO

export const isImageMediaType = (mediaType: MediaType | null | undefined): boolean =>
  getMediaTypeKey(mediaType) === MEDIA_TYPE_IMAGE

export const isAudioMediaType = (mediaType: MediaType | null | undefined): boolean =>
  getMediaTypeKey(mediaType) === MEDIA_TYPE_AUDIO

const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.opus', '.wma',
])

export const isAudioFilePath = (filePath: string | null | undefined): boolean => {
  if (!filePath) return false
  const ext = String(filePath).slice(String(filePath).lastIndexOf('.')).toLowerCase()
  return AUDIO_EXTENSIONS.has(ext)
}

export const isTextMediaType = (mediaType: MediaType | null | undefined): boolean =>
  getMediaTypeKey(mediaType) === MEDIA_TYPE_TEXT

export const isEditableMediaType = (mediaType: MediaType | null | undefined): boolean =>
  isVideoMediaType(mediaType) ||
  isImageMediaType(mediaType) ||
  isAudioMediaType(mediaType) ||
  isTextMediaType(mediaType)

export const isManagedMediaType = (mediaType: MediaType | null | undefined): boolean =>
  isEditableMediaType(mediaType)

export const findMediaTypeById = (mediaTypes: MediaType[] | null | undefined, id: unknown): MediaType | null => {
  if (!mediaTypes?.length || id == null) return null
  return mediaTypes.find(item => item.id === Number(id)) || null
}

export const getCurrentMediaType = (
  mediaTypes: MediaType[] | null | undefined,
  mediaTypeId: unknown,
): MediaType | null => findMediaTypeById(mediaTypes, mediaTypeId)

export const getDefaultMediaTypeId = (mediaTypes: MediaType[] | null | undefined): number | null => {
  const videoType = mediaTypes?.find(isVideoMediaType)
  return videoType?.id ?? mediaTypes?.[0]?.id ?? null
}

export const parseMediaTypeExtensions = (extensions: string | null | undefined): string[] =>
  String(extensions || '')
    .split(',')
    .map((ext) => ext.trim().toLowerCase())
    .filter(Boolean)

export const buildExtensionPathRegex = (extensions: string | null | undefined): string => {
  const parts = parseMediaTypeExtensions(extensions)
  if (!parts.length) return '$^'
  return `.${parts.join('$|.')}$`
}

export const inferMediaTypeFromPaths = (
  paths: string[],
  mediaTypes: MediaType[] | null | undefined,
): MediaType | null => {
  const candidates = (mediaTypes || []).filter((item) => !item.hidden)
  if (!candidates.length || !paths.length) return null

  const matchCounts = new Map<number, number>()

  for (const filePath of paths) {
    const ext = String(filePath).split('.').pop()?.toLowerCase()
    if (!ext) continue

    for (const mediaType of candidates) {
      if (!parseMediaTypeExtensions(mediaType.extensions).includes(ext)) continue
      matchCounts.set(mediaType.id, (matchCounts.get(mediaType.id) || 0) + 1)
    }
  }

  if (!matchCounts.size) return null

  let bestId = 0
  let bestCount = 0
  for (const [id, count] of matchCounts) {
    if (count > bestCount) {
      bestCount = count
      bestId = id
    }
  }

  return candidates.find((item) => item.id === bestId) || null
}

export const getMediaDeleteAssetFolder = (mediaType: MediaType | null | undefined): string | null => {
  const key = getMediaTypeKey(mediaType)
  if (key === MEDIA_TYPE_VIDEO) return 'videos'
  if (key === MEDIA_TYPE_IMAGE) return 'images'
  if (key === MEDIA_TYPE_AUDIO) return 'audios'
  if (key === MEDIA_TYPE_TEXT) return 'texts'
  return null
}

export const mediaTypeMatches = (
  mediaType: MediaType | null | undefined,
  allowedTypes: string[] = [],
): boolean => {
  if (!allowedTypes?.length) return true
  const key = getMediaTypeKey(mediaType)
  return allowedTypes.some(type => normalizeMediaTypeKey(type) === key)
}

export const matchesMediaTypeFilter = (
  param: MediaTypeFilterParam,
  mediaType: MediaType | null | undefined,
): boolean => {
  if (param.media_types?.length) {
    return mediaTypeMatches(mediaType, param.media_types)
  }

  if (param.media_type_id?.length) {
    return param.media_type_id.includes(Number(mediaType?.id))
  }

  return true
}

export function getMenuOrderedMediaTypes(mediaTypes: MediaType[] | null | undefined): MediaType[] {
  return [...(mediaTypes || [])]
    .filter(item => !item.hidden)
    .sort((a, b) => {
      const orderDiff = (a.order ?? 0) - (b.order ?? 0)
      if (orderDiff !== 0) return orderDiff
      return String(a.name || '').localeCompare(String(b.name || ''))
    })
}

/** Empty/omitted `selectedIds` → all managed (video/image/audio/text) types. */
export function resolveTargetMediaTypesForAdding(
  mediaTypes: MediaType[] | null | undefined,
  selectedIds: number[] | null | undefined,
): MediaType[] {
  const ordered = getMenuOrderedMediaTypes(mediaTypes).filter(isManagedMediaType)
  if (!selectedIds?.length) return ordered
  const idSet = new Set(selectedIds.map(Number).filter((id) => Number.isFinite(id)))
  return ordered.filter((item) => idSet.has(Number(item.id)))
}

export function combineMediaTypeExtensions(mediaTypes: MediaType[]): string {
  const parts = new Set<string>()
  for (const mediaType of mediaTypes) {
    for (const ext of parseMediaTypeExtensions(mediaType.extensions)) {
      parts.add(ext)
    }
  }
  return [...parts].join(',')
}

/** Assign each path to the first matching media type (by menu order). */
export function bucketFilesByMediaType(
  files: string[],
  mediaTypes: MediaType[],
): Map<number, string[]> {
  const extToType = new Map<string, MediaType>()
  for (const mediaType of mediaTypes) {
    for (const ext of parseMediaTypeExtensions(mediaType.extensions)) {
      if (!extToType.has(ext)) extToType.set(ext, mediaType)
    }
  }

  const buckets = new Map<number, string[]>()
  for (const mediaType of mediaTypes) {
    buckets.set(Number(mediaType.id), [])
  }

  for (const filePath of files) {
    const ext = String(filePath).split('.').pop()?.toLowerCase()
    if (!ext) continue
    const mediaType = extToType.get(ext)
    if (!mediaType) continue
    buckets.get(Number(mediaType.id))?.push(filePath)
  }

  return buckets
}

export function sortByMenuMediaTypeOrder<T>(
  items: T[],
  mediaTypes: MediaType[] | null | undefined,
  getMediaTypeId: (item: T) => unknown = (item) => (
    (item as { mediaType?: MediaType; mediaTypeId?: number }).mediaType?.id
    ?? (item as { mediaTypeId?: number }).mediaTypeId
  ),
): T[] {
  const orderById = new Map(
    getMenuOrderedMediaTypes(mediaTypes).map((mediaType, index) => [mediaType.id, index]),
  )

  return [...items].sort((a, b) => {
    const aOrder = orderById.get(Number(getMediaTypeId(a))) ?? Number.MAX_SAFE_INTEGER
    const bOrder = orderById.get(Number(getMediaTypeId(b))) ?? Number.MAX_SAFE_INTEGER
    return aOrder - bOrder
  })
}
