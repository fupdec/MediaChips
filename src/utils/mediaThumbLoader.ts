import {
  isThumbUnavailable,
  resolveMediaThumbDisplayUrl,
  CARD_THUMB_MAX_EDGE,
  type MediaThumbSubfolder,
} from '@/utils/thumbSource'

export type LoadMediaThumbOptions = {
  /** Longest edge for card decode; defaults to CARD_THUMB_MAX_EDGE. Pass null to skip. */
  maxEdge?: number | null
  subfolder?: MediaThumbSubfolder
}

export function loadMediaThumbUrl(
  mediaPath: string,
  mediaTypeFolder: string,
  id: number | string,
  options: LoadMediaThumbOptions = {},
): string | null {
  const subfolder = options.subfolder ?? 'thumbs'
  const maxEdge = options.maxEdge === null
    ? undefined
    : (options.maxEdge ?? CARD_THUMB_MAX_EDGE)
  const url = resolveMediaThumbDisplayUrl(
    mediaPath,
    mediaTypeFolder,
    id,
    subfolder,
    maxEdge != null ? {maxEdge} : undefined,
  )
  return isThumbUnavailable(url) ? null : url
}

/** Build local file URLs directly — avoids slow base64 batch API. */
export async function loadMediaThumbUrls(
  mediaPath: string,
  mediaTypeFolder: string,
  ids: Array<number | string>,
  options: LoadMediaThumbOptions = {},
): Promise<Record<number | string, string>> {
  const uniqueIds = [...new Set(ids.filter((id) => id != null))]
  if (!uniqueIds.length || !mediaPath) return {}

  const thumbs: Record<number | string, string> = {}
  for (const id of uniqueIds) {
    const url = loadMediaThumbUrl(mediaPath, mediaTypeFolder, id, options)
    if (url) thumbs[id] = url
  }
  return thumbs
}
