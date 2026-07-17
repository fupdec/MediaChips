import { and, eq, inArray } from 'drizzle-orm'
import type { DrizzleClient } from '../client'
import { tags } from '../schema/tags'
import { tagsInFilterRows } from '../schema/tagsInFilterRows'

export type TagsInFilterRowRecord = typeof tagsInFilterRows.$inferSelect

export function createTagsInFilterRowsRepository(db: DrizzleClient) {
  return {
    findByRowId(rowId: number) {
      return db.select()
        .from(tagsInFilterRows)
        .where(eq(tagsInFilterRows.rowId, rowId))
        .all()
    },

    findByRowIds(rowIds: number[]) {
      if (!rowIds.length) return []
      return db.select()
        .from(tagsInFilterRows)
        .where(inArray(tagsInFilterRows.rowId, rowIds))
        .all()
    },

    findByRowIdWithTags(rowId: number) {
      const rows = this.findByRowId(rowId)
      const tagIds = rows.map((row) => row.tagId)
      const tagRows = tagIds.length
        ? db.select().from(tags).all().filter((tag) => tagIds.includes(tag.id))
        : []
      const tagById = new Map(tagRows.map((tag) => [tag.id, tag]))

      return rows.map((row) => ({
        ...row,
        tag: tagById.get(row.tagId) ?? null,
      }))
    },

    deleteByRowId(rowId: number): void {
      db.delete(tagsInFilterRows).where(eq(tagsInFilterRows.rowId, rowId)).run()
    },

    findOrCreate(tagId: number, rowId: number, metaId: number): {row: TagsInFilterRowRecord; created: boolean} {
      const existing = db.select()
        .from(tagsInFilterRows)
        .where(and(
          eq(tagsInFilterRows.tagId, tagId),
          eq(tagsInFilterRows.rowId, rowId),
          eq(tagsInFilterRows.metaId, metaId),
        ))
        .get()

      if (existing) {
        return {row: existing, created: false}
      }

      const row = db.insert(tagsInFilterRows)
        .values({tagId, rowId, metaId})
        .onConflictDoNothing()
        .returning()
        .get()

      if (row) {
        return {row, created: true}
      }

      const raced = db.select()
        .from(tagsInFilterRows)
        .where(and(
          eq(tagsInFilterRows.tagId, tagId),
          eq(tagsInFilterRows.rowId, rowId),
          eq(tagsInFilterRows.metaId, metaId),
        ))
        .get()

      return {row: raced!, created: false}
    },
  }
}
