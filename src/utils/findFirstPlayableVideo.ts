import type {MediaItem} from '@/types/stores'

/**
 * First playlist entry whose path exists, or (when the original is missing)
 * whose verified copy is usable. Stops at the first hit (no full fan-out).
 */
export async function findFirstPlayableVideo<T extends Pick<MediaItem, 'path' | 'hasCopies'>>(
  videos: Array<T | null | undefined> = [],
  checkFileExistsFn: (filePath: string) => Promise<boolean>,
  hasUsableCopyFn?: (candidate: T) => Promise<boolean>,
): Promise<T | null> {
  for (const candidate of videos) {
    const filePath = candidate?.path
    if (!candidate || !filePath) continue
    if (await checkFileExistsFn(filePath)) return candidate
    if (candidate.hasCopies && hasUsableCopyFn && await hasUsableCopyFn(candidate)) return candidate
  }
  return null
}
