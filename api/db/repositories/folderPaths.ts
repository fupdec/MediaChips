import { eq, inArray, or, sql } from 'drizzle-orm'
import type { DrizzleClient } from '../client'
import { folderPaths, tagsInFolders } from '../schema/folderPaths'
import { normalizeMediaPath } from '../../utils/normalizeUserPath'
import { escapeLikePattern } from '../../services/globalSearchMerge'
import { nowIso } from '../utils/timestamps'
import { mapChunks } from '../utils/chunk'

export type FolderPathRow = typeof folderPaths.$inferSelect

function canonicalizeFolderPath(folderPath: string): string {
  return normalizeMediaPath(folderPath).replace(/[\\/]+$/, '')
}

export function createFolderPathsRepository(db: DrizzleClient) {
  const mergeFolderOntoSurvivor = (sourceId: number, survivorId: number) => {
    const linkRows = db.select().from(tagsInFolders)
      .where(eq(tagsInFolders.folderId, sourceId))
      .all()
    if (linkRows.length) {
      db.insert(tagsInFolders)
        .values(linkRows.map((link) => ({
          folderId: survivorId,
          tagId: link.tagId,
          metaId: link.metaId,
        })))
        .onConflictDoNothing()
        .run()
      db.delete(tagsInFolders).where(eq(tagsInFolders.folderId, sourceId)).run()
    }
    db.delete(folderPaths).where(eq(folderPaths.id, sourceId)).run()
  }

  const applyRemappedPath = (
    row: FolderPathRow,
    nextPath: string,
    timestamp: string,
  ): boolean => {
    if (!nextPath || nextPath === row.path) return false

    const conflict = db.select().from(folderPaths)
      .where(eq(folderPaths.path, nextPath))
      .get()

    if (conflict && conflict.id !== row.id) {
      mergeFolderOntoSurvivor(row.id, conflict.id)
      return true
    }

    db.update(folderPaths)
      .set({path: nextPath, updatedAt: timestamp})
      .where(eq(folderPaths.id, row.id))
      .run()
    return true
  }

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

      // instr keeps JS String.includes semantics (case-sensitive, literal %/_) and
      // avoids loading the full folderPaths table when only a few rows match.
      const rows = db.select().from(folderPaths)
        .where(sql`instr(${folderPaths.path}, ${find}) > 0`)
        .all()
      let changed = 0
      const timestamp = nowIso()

      for (const row of rows) {
        const nextPath = canonicalizeFolderPath(row.path.replace(find, replace))
        if (applyRemappedPath(row, nextPath, timestamp)) changed += 1
      }

      return changed
    },

    remapPathPrefix(oldPrefix: string, newPrefix: string): number {
      const from = canonicalizeFolderPath(oldPrefix)
      const to = canonicalizeFolderPath(newPrefix)
      if (!from || from === to) return 0

      const fromNorm = from.replace(/\\/g, '/')
      const prefixPattern = `${escapeLikePattern(fromNorm)}/%`
      const rows = db.select().from(folderPaths)
        .where(or(
          sql`replace(${folderPaths.path}, '\\', '/') = ${fromNorm}`,
          sql`replace(${folderPaths.path}, '\\', '/') LIKE ${prefixPattern} ESCAPE '\\'`,
        ))
        .all()
      let changed = 0
      const timestamp = nowIso()

      for (const row of rows) {
        const nextRaw = to + row.path.slice(from.length)
        const nextPath = canonicalizeFolderPath(nextRaw)
        if (applyRemappedPath(row, nextPath, timestamp)) changed += 1
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
