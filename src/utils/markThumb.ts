import path from 'path-browserify'
import { typedApi } from '@/services/typedApi'
import { buildLocalFileUrl, checkFileExists, createThumb } from '@/services/fileService'
import { isThumbUnavailable, resolveMediaThumbDisplayUrl } from '@/utils/thumbSource'

export interface MarkThumbTarget {
  id?: number
  time?: number
  [key: string]: unknown
}

export function formatMarkTimestamp(time: number): string {
  return new Date(1000 * time).toISOString().substr(11, 12)
}

export function getMarkImagePath(mediaPath: string | null | undefined, markId: number | string): string {
  return path.join(mediaPath || '', 'videos/marks', `${markId}.jpg`)
}

export function isMarkThumbUnavailable(src: string | null | undefined): boolean {
  return isThumbUnavailable(src)
}

export async function loadMarkImageDisplayUrl({
  markId,
  mediaPath,
  mediaId,
}: {
  markId?: number | string
  mediaPath?: string | null
  mediaId?: number | string
}): Promise<string> {
  if (!mediaPath || !markId) {
    return '/images/unavailable.png'
  }

  const markImagePath = getMarkImagePath(mediaPath, markId)
  if (await checkFileExists(markImagePath)) {
    return buildLocalFileUrl(markImagePath)
  }

  if (mediaId) {
    const videoThumb = resolveMediaThumbDisplayUrl(mediaPath, 'videos', mediaId)
    if (!isMarkThumbUnavailable(videoThumb)) {
      return videoThumb!
    }
  }

  return '/images/unavailable.png'
}

function isMarkThumbAlreadyExistsError(error: unknown): boolean {
  const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message
  return typeof message === 'string' && message.toLowerCase().includes('already exists')
}

export type EnsureMarkThumbResult = 'skipped' | 'exists' | 'created'

export async function ensureMarkThumb({
  mark,
  videoPath,
  mediaPath,
  mediaId,
  onUpdated,
}: {
  mark?: MarkThumbTarget
  videoPath?: string | null
  mediaPath?: string | null
  mediaId?: number | string
  onUpdated?: (markId: number) => void
}): Promise<EnsureMarkThumbResult> {
  if (!mark?.id) return 'skipped'

  const imgPath = mediaPath ? getMarkImagePath(mediaPath, mark.id) : null
  if (imgPath && await checkFileExists(imgPath)) {
    onUpdated?.(mark.id)
    return 'exists'
  }

  try {
    if (mediaId) {
      await typedApi.createMarkThumb({
        markId: mark.id,
        mediaId,
      })
      onUpdated?.(mark.id)
      return 'created'
    }

    if (!videoPath || !imgPath) return 'skipped'

    await createThumb(
      mark.time ?? 0,
      videoPath,
      imgPath,
      180,
    )
    onUpdated?.(mark.id)
    return 'created'
  } catch (error) {
    if (isMarkThumbAlreadyExistsError(error)) {
      onUpdated?.(mark.id)
      return 'exists'
    }
    throw error
  }
}
