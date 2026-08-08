import type { ApiDb } from '../types/db'
import { createTagsInMediaRepository } from '../db/repositories/tagsInMedia'
import {
  loadInheritedFolderTagsForMediaRows,
} from './mediaInheritedFolderTags'

/**
 * Copy folder-inherited tags into tagsInMedia for newly added files.
 * Folder tags are otherwise only merged at list hydrate time; writing them on
 * add matches Settings → Files docs ("when adding media") and keeps Edit/DB
 * queries consistent for images and videos alike.
 */
export async function applyFolderTagsOnMediaAdd(
  db: ApiDb,
  media: {id?: unknown; path?: unknown},
): Promise<number> {
  const mediaId = Number(media.id)
  const mediaPath = String(media.path || '')
  if (!Number.isFinite(mediaId) || mediaId <= 0 || !mediaPath) return 0

  const inherited = await loadInheritedFolderTagsForMediaRows(db, [
    {id: mediaId, path: mediaPath},
  ])
  if (!inherited.length) return 0

  const tagsInMediaRepo = createTagsInMediaRepository(db.drizzle)
  const inserted = tagsInMediaRepo.bulkCreate(
    inherited.map((row) => ({
      mediaId: row.mediaId,
      tagId: row.tagId,
      metaId: row.metaId,
    })),
  )

  return Array.isArray(inserted) ? inserted.length : 0
}
