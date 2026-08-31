import { eq } from 'drizzle-orm'
import type { DrizzleClient } from '../client'
import { mediaTypes } from '../schema/mediaTypes'
import { mediaTypesInWatchedFolders, watchedFolders } from '../schema/watchedFolders'
import { toPublicWatchedFolder } from './watchedFolders'

export function createMediaTypesInWatchedFoldersRepository(db: DrizzleClient) {
  return {
    findAllWithRelations() {
      const links = db.select().from(mediaTypesInWatchedFolders).all()
      const folderRows = db.select().from(watchedFolders).all()
      const mediaTypeRows = db.select().from(mediaTypes).all()

      const folderById = new Map(folderRows.map((row) => [row.id, toPublicWatchedFolder(row)]))
      const mediaTypeById = new Map(mediaTypeRows.map((row) => [row.id, row]))

      return links.flatMap((link) => {
        const watchedFolder = folderById.get(link.folderId)
        if (!watchedFolder) return []
        return [{
          ...link,
          mediaType: mediaTypeById.get(link.mediaTypeId) ?? null,
          watchedFolder,
        }]
      })
    },

    findOrCreate(folderId: number, mediaTypeId: number): {row: typeof mediaTypesInWatchedFolders.$inferSelect; created: boolean} {
      const existing = db.select()
        .from(mediaTypesInWatchedFolders)
        .where(eq(mediaTypesInWatchedFolders.folderId, folderId))
        .all()
        .find((link) => link.mediaTypeId === mediaTypeId)

      if (existing) {
        return {row: existing, created: false}
      }

      const row = db.insert(mediaTypesInWatchedFolders)
        .values({folderId, mediaTypeId})
        .returning()
        .get()

      return {row, created: true}
    },
  }
}
