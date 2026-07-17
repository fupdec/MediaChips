import { and, eq, inArray } from 'drizzle-orm'
import type { DrizzleClient } from '../client'
import { meta } from '../schema/meta'
import { tags } from '../schema/tags'
import { tagsInTags } from '../schema/tagsInTag'
import { mapChunks } from '../utils/chunk'

type TagSummary = Pick<typeof tags.$inferSelect, 'name' | 'color' | 'metaId'>
type MetaSummary = Pick<typeof meta.$inferSelect, 'name' | 'icon'>

export function createTagsInTagRepository(db: DrizzleClient) {
  return {
    bulkCreate(items: Array<typeof tagsInTags.$inferInsert>) {
      if (!items.length) return []
      return mapChunks(items, (chunk) => (
        db.insert(tagsInTags).values(chunk).returning().all()
      ))
    },

    findOrCreate(data: typeof tagsInTags.$inferInsert) {
      const existing = db.select()
        .from(tagsInTags)
        .where(and(
          eq(tagsInTags.parentTagId, data.parentTagId),
          eq(tagsInTags.tagId, data.tagId),
          eq(tagsInTags.metaId, data.metaId),
        ))
        .get()

      if (existing) return [existing, false] as const

      const created = db.insert(tagsInTags).values(data).returning().get()
      return [created, true] as const
    },

    findAllByParentTagId(parentTagId: number) {
      const rows = db.select()
        .from(tagsInTags)
        .where(eq(tagsInTags.parentTagId, parentTagId))
        .all()

      const tagIds = [...new Set(rows.map((row) => row.tagId))]
      const tagRows = tagIds.length
        ? db.select({name: tags.name, color: tags.color, metaId: tags.metaId, id: tags.id})
          .from(tags)
          .all()
        : []
      const tagById = new Map(tagRows.map((row) => [row.id, row as TagSummary & {id: number}]))

      const metaIds = [...new Set(tagRows.map((row) => row.metaId).filter((id): id is number => id != null))]
      const metaRows = metaIds.length
        ? db.select({id: meta.id, name: meta.name, icon: meta.icon}).from(meta).all()
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
    },

    deleteByParentTagId(parentTagId: number): void {
      db.delete(tagsInTags).where(eq(tagsInTags.parentTagId, parentTagId)).run()
    },

    deleteOne(parentTagId: number, tagId: number): void {
      db.delete(tagsInTags)
        .where(and(
          eq(tagsInTags.parentTagId, parentTagId),
          eq(tagsInTags.tagId, tagId),
        ))
        .run()
    },

    deleteByParentTagAndMeta(parentTagId: number, metaId: number): void {
      db.delete(tagsInTags)
        .where(and(
          eq(tagsInTags.parentTagId, parentTagId),
          eq(tagsInTags.metaId, metaId),
        ))
        .run()
    },

    deleteByParentTagIdsAndMeta(parentTagIds: number[], metaId: number): void {
      if (!parentTagIds.length) return

      db.delete(tagsInTags)
        .where(and(
          inArray(tagsInTags.parentTagId, parentTagIds),
          eq(tagsInTags.metaId, metaId),
        ))
        .run()
    },
  }
}
