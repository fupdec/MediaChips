import { and, eq, inArray } from 'drizzle-orm'
import { serializeMetaValueForStorage } from '../../../shared/schemas/coercion'
import type { DrizzleClient } from '../client'
import { meta } from '../schema/meta'
import { valuesInTags } from '../schema/valuesInTag'
import { mapChunks } from '../utils/chunk'

function normalizeStoredMetaValue(value: unknown): string | null {
  return serializeMetaValueForStorage(value)
}

export function createValuesInTagRepository(db: DrizzleClient) {
  return {
    bulkCreate(items: Array<typeof valuesInTags.$inferInsert>) {
      if (!items.length) return []

      const unique = new Map<string, typeof valuesInTags.$inferInsert>()
      for (const item of items) {
        unique.set(`${item.tagId}:${item.metaId}`, {
          ...item,
          value: normalizeStoredMetaValue(item.value),
        })
      }

      return mapChunks([...unique.values()], (chunk) => (
        db.insert(valuesInTags).values(chunk).onConflictDoNothing().returning().all()
      ))
    },

    findAllByTagId(tagId: number) {
      const rows = db.select()
        .from(valuesInTags)
        .where(eq(valuesInTags.tagId, tagId))
        .all()

      const metaRows = db.select().from(meta).all()
      const metaById = new Map(metaRows.map((row) => [row.id, row]))

      return rows.map((row) => ({
        ...row,
        meta: metaById.get(row.metaId) ?? null,
      }))
    },

    findAllByMetaId(metaId: number) {
      return db.select()
        .from(valuesInTags)
        .where(eq(valuesInTags.metaId, metaId))
        .all()
    },

    updateValue(tagId: number, metaId: number, value: string | null): void {
      db.update(valuesInTags)
        .set({value: normalizeStoredMetaValue(value)})
        .where(and(
          eq(valuesInTags.tagId, tagId),
          eq(valuesInTags.metaId, metaId),
        ))
        .run()
    },

    deleteOne(tagId: number, metaId: number): void {
      db.delete(valuesInTags)
        .where(and(
          eq(valuesInTags.tagId, tagId),
          eq(valuesInTags.metaId, metaId),
        ))
        .run()
    },

    deleteByTagId(tagId: number): void {
      db.delete(valuesInTags).where(eq(valuesInTags.tagId, tagId)).run()
    },

    deleteByTagIdsAndMeta(tagIds: number[], metaId: number): void {
      if (!tagIds.length) return

      db.delete(valuesInTags)
        .where(and(
          inArray(valuesInTags.tagId, tagIds),
          eq(valuesInTags.metaId, metaId),
        ))
        .run()
    },
  }
}
