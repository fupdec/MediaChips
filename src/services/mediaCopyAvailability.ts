import {mediaCopiesApi} from '@/services/typedApi/mediaCopies'
import {queueMediaCopyPaths} from './mediaCopyPaths'
import {isRemoteMediaPath} from '@shared/remoteMedia'
import {checkFileExists} from '@/services/fileService'

/**
 * True when at least one verified copy can be used: any network copy
 * (NAS / Drive / OneDrive / Dropbox) counts as available without probing,
 * a local copy counts only if its file exists on disk.
 */
export async function hasUsableMediaCopy(
  mediaId: number,
  checkExists: (filePath: string) => Promise<boolean> = checkFileExists,
  listCopies: typeof mediaCopiesApi.list = mediaCopiesApi.list,
): Promise<boolean> {
  if (!(mediaId > 0)) return false
  try {
    const {data} = await listCopies(mediaId)
    const copies = data?.copies ?? []
    if (copies.some((copy) => copy.provider !== 'local')) return true
    for (const copy of copies) {
      if (copy.path && await checkExists(copy.path)) return true
    }
  } catch {
    // Copies could not be listed — do not claim availability.
  }
  return false
}

/** Original first; copies are consulted only when the original is missing. */
export async function isMediaFileAvailable(
  media: {id?: number; path?: string; hasCopies?: boolean | number} | null | undefined,
  checkExists: (filePath: string) => Promise<boolean> = checkFileExists,
): Promise<boolean> {
  if (!media) return false
  if (media.path && await checkExists(media.path)) return true
  if (!media.hasCopies || !(Number(media.id) > 0)) return false
  try {
    const paths = await queueMediaCopyPaths(Number(media.id))
    if (paths.some(path => isRemoteMediaPath(path))) return true
    for (const path of paths) {
      if (path && await checkExists(path)) return true
    }
  } catch {
    // A failed check must not claim that the file is available.
  }
  return false
}
