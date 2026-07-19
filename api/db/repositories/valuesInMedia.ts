import { and, eq, inArray } from 'drizzle-orm'
import { serializeMetaValueForStorage } from '../../../shared/schemas/coercion'
import type { DrizzleClient } from '../client'
import { meta } from '../schema/meta'
import { valuesInMedia } from '../schema/valuesInMedia'
import { mapChunks } from '../utils/chunk'

function normalizeStoredMetaValue(value: unknown): string | null {
  return serializeMetaValueForStorage(value)
}

export function createValuesInMediaRepository(db: DrizzleClient) {
  return {
    bulkCreate(items: Array<typeof valuesInMedia.$inferInsert>) {
      if (!items.length) return []

      const unique = new Map<string, typeof valuesInMedia.$inferInsert>()
      for (const item of items) {
        unique.set(`${item.mediaId}:${item.metaId}`, {
          ...item,
          value: normalizeStoredMetaValue(item.value),
        })
      }

      return mapChunks([...unique.values()], (chunk) => (
        db.insert(valuesInMedia).values(chunk).onConflictDoNothing().returning().all()
      ))
    },

    findAllByMediaId(mediaId: number) {
      const rows = db.select()
        .from(valuesInMedia)
        .where(eq(valuesInMedia.mediaId, mediaId))
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
        .from(valuesInMedia)
        .where(eq(valuesInMedia.metaId, metaId))
        .all()
    },

    updateValue(mediaId: number, metaId: number, value: string | null): void {
      db.update(valuesInMedia)
        .set({value: normalizeStoredMetaValue(value)})
        .where(and(
          eq(valuesInMedia.mediaId, mediaId),
          eq(valuesInMedia.metaId, metaId),
        ))
        .run()
    },

    deleteOne(mediaId: number, metaId: number): void {
      db.delete(valuesInMedia)
        .where(and(
          eq(valuesInMedia.mediaId, mediaId),
          eq(valuesInMedia.metaId, metaId),
        ))
        .run()
    },

    deleteByMediaId(mediaId: number): void {
      db.delete(valuesInMedia).where(eq(valuesInMedia.mediaId, mediaId)).run()
    },

    deleteByMediaIdsAndMeta(mediaIds: number[], metaId: number): void {
      if (!mediaIds.length) return

      db.delete(valuesInMedia)
        .where(and(
          inArray(valuesInMedia.mediaId, mediaIds),
          eq(valuesInMedia.metaId, metaId),
        ))
        .run()
    },
  }
}
