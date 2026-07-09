import { and, eq, inArray } from 'drizzle-orm'
import { serializeMetaValueForStorage } from '../../../shared/schemas/coercion'
import type { DrizzleClient } from '../client'
import { meta } from '../schema/meta'
import { valuesInMedia } from '../schema/valuesInMedia'

function normalizeStoredMetaValue(value: unknown): string | null {
  return serializeMetaValueForStorage(value)
}

export function createValuesInMediaRepository(db: DrizzleClient) {
  return {
    bulkCreate(items: Array<typeof valuesInMedia.$inferInsert>) {
      if (!items.length) return []

      const normalizedItems = items.map((item) => ({
        ...item,
        value: normalizeStoredMetaValue(item.value),
      }))

      return db.insert(valuesInMedia).values(normalizedItems).returning().all()
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
