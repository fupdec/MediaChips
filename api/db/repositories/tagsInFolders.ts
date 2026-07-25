import { and, eq, inArray } from 'drizzle-orm'
import type { DrizzleClient } from '../client'
import { folderPaths, tagsInFolders } from '../schema/folderPaths'
import { meta } from '../schema/meta'
import { tags } from '../schema/tags'
import { createFolderPathsRepository } from './folderPaths'
import { mapChunks } from '../utils/chunk'

type TagSummary = Pick<typeof tags.$inferSelect, 'name' | 'color' | 'metaId'>
type MetaSummary = Pick<typeof meta.$inferSelect, 'name' | 'icon'>

export type TagsInFolderInsert = typeof tagsInFolders.$inferInsert
export type HydratedFolderTag = ReturnType<typeof hydrateTagRows>[number]

export type FolderWithTags = {
  id: number
  path: string
  tags: HydratedFolderTag[]
}

function hydrateTagRows(
  db: DrizzleClient,
  rows: Array<typeof tagsInFolders.$inferSelect>,
) {
  const tagIds = [...new Set(rows.map((row) => row.tagId))]
  const tagRows = tagIds.length
    ? db.select({name: tags.name, color: tags.color, metaId: tags.metaId, id: tags.id})
      .from(tags)
      .where(inArray(tags.id, tagIds))
      .all()
    : []
  const tagById = new Map(tagRows.map((row) => [row.id, row as TagSummary & {id: number}]))

  const metaIds = [...new Set(tagRows.map((row) => row.metaId).filter((id): id is number => id != null))]
  const metaRows = metaIds.length
    ? db.select({id: meta.id, name: meta.name, icon: meta.icon})
      .from(meta)
      .where(inArray(meta.id, metaIds))
      .all()
    : []
  const metaById = new Map(metaRows.map((row) => [row.id, row as MetaSummary]))

  return rows.map((row) => {
    const tag = tagById.get(row.tagId)
    return {
      ...row,
      tag: tag
        ? {
          ...tag,
          meta: tag.metaId ? metaById.get(tag.metaId) ?? null : null,
        }
        : null,
    }
  })
}

export function createTagsInFoldersRepository(db: DrizzleClient) {
  const folderPathsRepo = createFolderPathsRepository(db)

  return {
    bulkCreate(items: Array<{path: string; tagId: number; metaId: number}>) {
      if (!items.length) return []

      const unique = new Map<string, TagsInFolderInsert>()
      for (const item of items) {
        const {folder} = folderPathsRepo.findOrCreateByPath(item.path)
        unique.set(`${folder.id}:${item.tagId}:${item.metaId}`, {
          folderId: folder.id,
          tagId: Number(item.tagId),
          metaId: Number(item.metaId),
        })
      }

      return mapChunks([...unique.values()], (chunk) => (
        db.insert(tagsInFolders).values(chunk).onConflictDoNothing().returning().all()
      ))
    },

    findOrCreate(data: {path: string; tagId: number; metaId: number}) {
      const {folder} = folderPathsRepo.findOrCreateByPath(data.path)
      const payload = {
        folderId: folder.id,
        tagId: Number(data.tagId),
        metaId: Number(data.metaId),
      }

      const existing = db.select()
        .from(tagsInFolders)
        .where(and(
          eq(tagsInFolders.folderId, payload.folderId),
          eq(tagsInFolders.tagId, payload.tagId),
          eq(tagsInFolders.metaId, payload.metaId),
        ))
        .get()

      if (existing) return [existing, false] as const

      const created = db.insert(tagsInFolders)
        .values(payload)
        .onConflictDoNothing()
        .returning()
        .get()

      if (created) return [created, true] as const

      const raced = db.select()
        .from(tagsInFolders)
        .where(and(
          eq(tagsInFolders.folderId, payload.folderId),
          eq(tagsInFolders.tagId, payload.tagId),
          eq(tagsInFolders.metaId, payload.metaId),
        ))
        .get()

      return [raced!, false] as const
    },

    findAllByPath(folderPath: string) {
      const folder = folderPathsRepo.findByPath(folderPath)
      if (!folder) return []

      const rows = db.select()
        .from(tagsInFolders)
        .where(eq(tagsInFolders.folderId, folder.id))
        .all()

      return hydrateTagRows(db, rows)
    },

    findAllByPaths(paths: string[]) {
      const folders = folderPathsRepo.findAllByPaths(paths)
      if (!folders.length) {
        return {} as Record<string, HydratedFolderTag[]>
      }

      const folderIds = folders.map((folder) => folder.id)
      const rows = db.select()
        .from(tagsInFolders)
        .where(inArray(tagsInFolders.folderId, folderIds))
        .all()

      const hydrated = hydrateTagRows(db, rows)
      const byFolderId = new Map<number, HydratedFolderTag[]>()
      for (const row of hydrated) {
        const list = byFolderId.get(row.folderId) || []
        list.push(row)
        byFolderId.set(row.folderId, list)
      }

      const result: Record<string, HydratedFolderTag[]> = {}
      for (const folder of folders) {
        result[folder.path] = byFolderId.get(folder.id) || []
      }
      return result
    },

    /** All folders that have at least one tag, with hydrated tag rows. */
    findAllWithTags(): FolderWithTags[] {
      const folders = db.select().from(folderPaths).all()
      if (!folders.length) return []

      const folderIds = folders.map((folder) => folder.id)
      const rows = db.select()
        .from(tagsInFolders)
        .where(inArray(tagsInFolders.folderId, folderIds))
        .all()

      if (!rows.length) return []

      const hydrated = hydrateTagRows(db, rows)
      const byFolderId = new Map<number, HydratedFolderTag[]>()
      for (const row of hydrated) {
        const list = byFolderId.get(row.folderId) || []
        list.push(row)
        byFolderId.set(row.folderId, list)
      }

      return folders
        .map((folder) => ({
          id: folder.id,
          path: folder.path,
          tags: byFolderId.get(folder.id) || [],
        }))
        .filter((folder) => folder.tags.length > 0)
        .sort((a, b) => a.path.localeCompare(b.path))
    },

    deleteOne(folderPath: string, tagId: number): void {
      const folder = folderPathsRepo.findByPath(folderPath)
      if (!folder) return

      db.delete(tagsInFolders)
        .where(and(
          eq(tagsInFolders.folderId, folder.id),
          eq(tagsInFolders.tagId, tagId),
        ))
        .run()
    },

    deleteByPathAndMeta(folderPath: string, metaId: number): void {
      const folder = folderPathsRepo.findByPath(folderPath)
      if (!folder) return

      db.delete(tagsInFolders)
        .where(and(
          eq(tagsInFolders.folderId, folder.id),
          eq(tagsInFolders.metaId, metaId),
        ))
        .run()
    },

    /**
     * Remove all tags for a folder path and delete the folderPaths row.
     * Returns true if a folder row existed.
     */
    clearAllByPath(folderPath: string): boolean {
      const folder = folderPathsRepo.findByPath(folderPath)
      if (!folder) return false

      db.delete(tagsInFolders).where(eq(tagsInFolders.folderId, folder.id)).run()
      folderPathsRepo.deleteById(folder.id)
      return true
    },

    replaceForPathAndMeta(folderPath: string, metaId: number, tagIds: number[]) {
      const {folder} = folderPathsRepo.findOrCreateByPath(folderPath)
      db.delete(tagsInFolders)
        .where(and(
          eq(tagsInFolders.folderId, folder.id),
          eq(tagsInFolders.metaId, metaId),
        ))
        .run()

      const uniqueTagIds = [...new Set(tagIds.map(Number).filter(Boolean))]
      if (!uniqueTagIds.length) return []

      const values = uniqueTagIds.map((tagId) => ({
        folderId: folder.id,
        tagId,
        metaId: Number(metaId),
      }))

      return db.insert(tagsInFolders).values(values).onConflictDoNothing().returning().all()
    },

    deleteByFolderId(folderId: number): void {
      db.delete(tagsInFolders).where(eq(tagsInFolders.folderId, folderId)).run()
    },

    /** Move tag links from deleted folder rows onto a survivor after path remap merge. */
    reassignFolderId(fromFolderId: number, toFolderId: number): void {
      if (fromFolderId === toFolderId) return
      const rows = db.select().from(tagsInFolders).where(eq(tagsInFolders.folderId, fromFolderId)).all()
      if (!rows.length) return

      db.insert(tagsInFolders)
        .values(rows.map((row) => ({
          folderId: toFolderId,
          tagId: row.tagId,
          metaId: row.metaId,
        })))
        .onConflictDoNothing()
        .run()

      db.delete(tagsInFolders).where(eq(tagsInFolders.folderId, fromFolderId)).run()
    },
  }
}
