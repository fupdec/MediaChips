import { eq, inArray, sql } from 'drizzle-orm'
import type { DrizzleClient } from '../client'
import { folderPaths, tagsInFolders } from '../schema/folderPaths'
import { normalizeMediaPath } from '../../utils/normalizeUserPath'
import { nowIso } from '../utils/timestamps'
import { mapChunks } from '../utils/chunk'

export type FolderPathRow = typeof folderPaths.$inferSelect

function canonicalizeFolderPath(folderPath: string): string {
  return normalizeMediaPath(folderPath).replace(/[\\/]+$/, '')
}

export function createFolderPathsRepository(db: DrizzleClient) {
  return {
    canonicalizePath(folderPath: string): string {
      return canonicalizeFolderPath(folderPath)
    },

    findByPath(folderPath: string): FolderPathRow | undefined {
      const path = canonicalizeFolderPath(folderPath)
      if (!path) return undefined
      return db.select().from(folderPaths).where(eq(folderPaths.path, path)).get()
    },

    findOrCreateByPath(folderPath: string): {folder: FolderPathRow; created: boolean} {
      const path = canonicalizeFolderPath(folderPath)
      if (!path) {
        throw new Error('Folder path is required')
      }

      const existing = db.select().from(folderPaths).where(eq(folderPaths.path, path)).get()
      if (existing) {
        return {folder: existing, created: false}
      }

      const timestamp = nowIso()
      const folder = db.insert(folderPaths)
        .values({
          path,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoNothing()
        .returning()
        .get()

      if (folder) {
        return {folder, created: true}
      }

      const raced = db.select().from(folderPaths).where(eq(folderPaths.path, path)).get()
      return {folder: raced!, created: false}
    },

    findAllByPaths(paths: string[]): FolderPathRow[] {
      const unique = [...new Set(paths.map(canonicalizeFolderPath).filter(Boolean))]
      if (!unique.length) return []

      return mapChunks(unique, (chunk) => (
        db.select().from(folderPaths).where(inArray(folderPaths.path, chunk)).all()
      ))
    },

    /**
     * Apply the same find/replace used for media bulk path editing onto folderPaths.
     * When two folders collide after remap, tag links are merged onto the survivor.
     */
    remapPathFragment(find: string, replace: string): number {
      if (!find) return 0

      const rows = db.select().from(folderPaths).all()
      let changed = 0
      const timestamp = nowIso()

      for (const row of rows) {
        if (!row.path.includes(find)) continue
        const nextPath = canonicalizeFolderPath(row.path.replace(find, replace))
        if (!nextPath || nextPath === row.path) continue

        const conflict = db.select().from(folderPaths)
          .where(eq(folderPaths.path, nextPath))
          .get()

        if (conflict && conflict.id !== row.id) {
          // Merge tags onto surviving path, then drop this row
          const linkRows = db.select().from(tagsInFolders)
            .where(eq(tagsInFolders.folderId, row.id))
            .all()
          if (linkRows.length) {
            db.insert(tagsInFolders)
              .values(linkRows.map((link) => ({
                folderId: conflict.id,
                tagId: link.tagId,
                metaId: link.metaId,
              })))
              .onConflictDoNothing()
              .run()
            db.delete(tagsInFolders).where(eq(tagsInFolders.folderId, row.id)).run()
          }
          db.delete(folderPaths).where(eq(folderPaths.id, row.id)).run()
          changed += 1
          continue
        }

        db.update(folderPaths)
          .set({path: nextPath, updatedAt: timestamp})
          .where(eq(folderPaths.id, row.id))
          .run()
        changed += 1
      }

      return changed
    },

    remapPathPrefix(oldPrefix: string, newPrefix: string): number {
      const from = canonicalizeFolderPath(oldPrefix)
      const to = canonicalizeFolderPath(newPrefix)
      if (!from || from === to) return 0

      const rows = db.select().from(folderPaths).all()
      let changed = 0
      const timestamp = nowIso()
      const fromNorm = from.replace(/\\/g, '/')

      for (const row of rows) {
        const normalized = row.path.replace(/\\/g, '/')
        if (normalized !== fromNorm && !normalized.startsWith(`${fromNorm}/`)) continue

        const nextRaw = to + row.path.slice(from.length)
        const nextPath = canonicalizeFolderPath(nextRaw)
        if (!nextPath || nextPath === row.path) continue

        const conflict = db.select().from(folderPaths)
          .where(eq(folderPaths.path, nextPath))
          .get()

        if (conflict && conflict.id !== row.id) {
          const linkRows = db.select().from(tagsInFolders)
            .where(eq(tagsInFolders.folderId, row.id))
            .all()
          if (linkRows.length) {
            db.insert(tagsInFolders)
              .values(linkRows.map((link) => ({
                folderId: conflict.id,
                tagId: link.tagId,
                metaId: link.metaId,
              })))
              .onConflictDoNothing()
              .run()
            db.delete(tagsInFolders).where(eq(tagsInFolders.folderId, row.id)).run()
          }
          db.delete(folderPaths).where(eq(folderPaths.id, row.id)).run()
          changed += 1
          continue
        }

        db.update(folderPaths)
          .set({path: nextPath, updatedAt: timestamp})
          .where(eq(folderPaths.id, row.id))
          .run()
        changed += 1
      }

      return changed
    },

    deleteById(id: number): void {
      db.delete(folderPaths).where(eq(folderPaths.id, id)).run()
    },

    countAll(): number {
      const row = db.select({count: sql<number>`count(*)`}).from(folderPaths).get()
      return Number(row?.count ?? 0)
    },
  }
}
