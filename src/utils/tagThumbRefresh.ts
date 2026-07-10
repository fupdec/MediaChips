import path from 'path-browserify'
import { invalidateFileExistsCache } from '@/services/fileService'
import { invalidateTagThumbCaches } from '@/utils/thumbDisplayCache'

const TAG_IMAGE_FILE_TYPES = ['main', 'alt', 'custom1', 'custom2', 'avatar', 'header'] as const

interface ThumbRefreshStore {
  refreshThumb: (id: number | null | undefined) => void
}

export function invalidateTagThumbFileExistsCaches(
  dbPath: string,
  metaId: number | string,
  tagId: number | string,
): void {
  if (!dbPath) return

  const metaDir = path.join(dbPath, 'meta', String(metaId))
  for (const type of TAG_IMAGE_FILE_TYPES) {
    invalidateFileExistsCache(path.join(metaDir, `${tagId}_${type}.jpg`))
  }
}

export function refreshTagThumbDisplay(
  itemsStore: ThumbRefreshStore,
  dbPath: string,
  metaId: number | string,
  tagId: number | string,
): void {
  invalidateTagThumbCaches(metaId, tagId)
  invalidateTagThumbFileExistsCaches(dbPath, metaId, tagId)
  itemsStore.refreshThumb(Number(tagId))
}
