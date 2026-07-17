import { and, asc, eq, inArray } from 'drizzle-orm'
import type { DrizzleClient } from '../client'
import { meta } from '../schema/meta'
import { pinnedMetas } from '../schema/pinnedMeta'
import { forEachChunk } from '../utils/chunk'

export type PinnedMetaRow = typeof pinnedMetas.$inferSelect
export type MetaRow = typeof meta.$inferSelect

export type PinnedMetaWithMeta = PinnedMetaRow & {
  meta: MetaRow | null
}

function attachMetaRows(
  db: DrizzleClient,
  rows: PinnedMetaRow[],
  metaIdField: 'metaId' | 'pinnedMetaId',
): PinnedMetaWithMeta[] {
  if (!rows.length) return []

  const lookupIds = [...new Set(rows.map((row) => row[metaIdField]))]
  const metaRows = lookupIds.length
    ? db.select().from(meta).where(inArray(meta.id, lookupIds)).all()
    : []
  const metaById = new Map(metaRows.map((row) => [row.id, row]))

  return rows.map((row) => ({
    ...row,
    meta: metaById.get(row[metaIdField]) ?? null,
  }))
}

export function createPinnedMetaRepository(db: DrizzleClient) {
  return {
    create(data: {
      metaId: number
      pinnedMetaId: number
      scraper?: string | null
      show?: boolean | null
      order?: number | null
    }): PinnedMetaRow {
      return db.insert(pinnedMetas)
        .values({
          metaId: data.metaId,
          pinnedMetaId: data.pinnedMetaId,
          scraper: data.scraper ?? null,
          show: data.show ?? true,
          order: data.order ?? null,
        })
        .returning()
        .get()
    },

    bulkCreate(items: Array<{
      metaId: number
      pinnedMetaId: number
      scraper?: string | null
      show?: boolean | null
      order?: number | null
    }>): void {
      if (!items.length) return

      forEachChunk(items, (chunk) => {
        db.insert(pinnedMetas)
          .values(chunk.map((item) => ({
            metaId: item.metaId,
            pinnedMetaId: item.pinnedMetaId,
            scraper: item.scraper ?? null,
            show: item.show ?? true,
            order: item.order ?? null,
          })))
          .run()
      })
    },

    findAll(filters: {metaId?: number; pinnedMetaId?: number} = {}): PinnedMetaWithMeta[] {
      const conditions = []
      if (filters.metaId != null) conditions.push(eq(pinnedMetas.metaId, filters.metaId))
      if (filters.pinnedMetaId != null) conditions.push(eq(pinnedMetas.pinnedMetaId, filters.pinnedMetaId))

      const rows = conditions.length
        ? db.select().from(pinnedMetas).where(and(...conditions)).orderBy(asc(pinnedMetas.order)).all()
        : db.select().from(pinnedMetas).orderBy(asc(pinnedMetas.order)).all()

      return attachMetaRows(db, rows, 'pinnedMetaId')
    },

    findAllByPinnedMetaId(pinnedMetaId: number): PinnedMetaWithMeta[] {
      const rows = db.select()
        .from(pinnedMetas)
        .where(eq(pinnedMetas.pinnedMetaId, pinnedMetaId))
        .all()

      return attachMetaRows(db, rows, 'metaId')
    },

    update(metaId: number, pinnedMetaId: number, data: Partial<PinnedMetaRow>): void {
      db.update(pinnedMetas)
        .set(data)
        .where(and(
          eq(pinnedMetas.metaId, metaId),
          eq(pinnedMetas.pinnedMetaId, pinnedMetaId),
        ))
        .run()
    },

    delete(pinnedMetaId: number, metaId: number): void {
      db.delete(pinnedMetas)
        .where(and(
          eq(pinnedMetas.pinnedMetaId, pinnedMetaId),
          eq(pinnedMetas.metaId, metaId),
        ))
        .run()
    },
  }
}
