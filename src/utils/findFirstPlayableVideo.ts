import type {MediaItem} from '@/types/stores'

/**
 * First playlist entry whose path exists. Stops at the first hit (no full fan-out).
 */
export async function findFirstPlayableVideo<T extends Pick<MediaItem, 'path'>>(
  videos: Array<T | null | undefined> = [],
  checkFileExistsFn: (filePath: string) => Promise<boolean>,
): Promise<T | null> {
  for (const candidate of videos) {
    const filePath = candidate?.path
    if (!filePath) continue
    if (await checkFileExistsFn(filePath)) return candidate
  }
  return null
}
