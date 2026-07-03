import { and, asc, eq } from 'drizzle-orm'
import type { DrizzleClient } from '../client'
import { mediaTypes } from '../schema/mediaTypes'
import { meta } from '../schema/meta'
import { metaInMediaTypes } from '../schema/metaInMediaTypes'

export type MetaInMediaTypeRow = typeof metaInMediaTypes.$inferSelect

export function createMetaInMediaTypesRepository(db: DrizzleClient) {
  return {
    create(data: {
      metaId: number
      mediaTypeId: number
      scraper?: string | null
      show?: boolean | null
      order?: number | null
    }): MetaInMediaTypeRow {
      return db.insert(metaInMediaTypes)
        .values({
          metaId: data.metaId,
          mediaTypeId: data.mediaTypeId,
          scraper: data.scraper ?? null,
          show: data.show ?? true,
          order: data.order ?? null,
        })
        .returning()
        .get()
    },

    findByMediaTypeId(mediaTypeId: number) {
      const rows = db.select()
        .from(metaInMediaTypes)
        .where(eq(metaInMediaTypes.mediaTypeId, mediaTypeId))
        .orderBy(asc(metaInMediaTypes.order))
        .all()

      const metaRows = db.select().from(meta).all()
      const metaById = new Map(metaRows.map((row) => [row.id, row]))

      return rows.map((row) => ({
        ...row,
        meta: metaById.get(row.metaId) ?? null,
      }))
    },

    findByMetaId(metaId: number) {
      const rows = db.select()
        .from(metaInMediaTypes)
        .where(eq(metaInMediaTypes.metaId, metaId))
        .orderBy(asc(metaInMediaTypes.order))
        .all()

      const mediaTypeRows = db.select().from(mediaTypes).all()
      const mediaTypeById = new Map(mediaTypeRows.map((row) => [row.id, row]))

      return rows.map((row) => ({
        ...row,
        mediaType: mediaTypeById.get(row.mediaTypeId) ?? null,
      }))
    },

    findAll() {
      return db.select()
        .from(metaInMediaTypes)
        .orderBy(asc(metaInMediaTypes.order))
        .all()
    },

    update(metaId: number, mediaTypeId: number, data: Partial<MetaInMediaTypeRow>): void {
      db.update(metaInMediaTypes)
        .set(data)
        .where(and(
          eq(metaInMediaTypes.metaId, metaId),
          eq(metaInMediaTypes.mediaTypeId, mediaTypeId),
        ))
        .run()
    },

    delete(metaId: number, mediaTypeId: number): void {
      db.delete(metaInMediaTypes)
        .where(and(
          eq(metaInMediaTypes.metaId, metaId),
          eq(metaInMediaTypes.mediaTypeId, mediaTypeId),
        ))
        .run()
    },
  }
}
