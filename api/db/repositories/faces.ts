import { count, eq, inArray, sql } from 'drizzle-orm'
import type { DrizzleClient } from '../client'
import { faces } from '../schema/faces'
import { forEachChunk } from '../utils/chunk'

export type FaceRow = typeof faces.$inferSelect
export type FaceInsert = typeof faces.$inferInsert

export function createFacesRepository(db: DrizzleClient) {
  return {
    create(data: Partial<FaceInsert>): FaceRow {
      return db.insert(faces)
        .values({
          mediaId: Number(data.mediaId),
          timestamp: data.timestamp ?? null,
          score: data.score ?? 0,
          x: data.x ?? 0,
          y: data.y ?? 0,
          width: data.width ?? 0,
          height: data.height ?? 0,
          cropPath: data.cropPath ?? null,
          createdAt: data.createdAt ?? new Date().toISOString(),
        })
        .returning()
        .get()
    },

    bulkCreate(items: Array<Partial<FaceInsert>>): void {
      if (!items.length) return

      const createdAt = new Date().toISOString()
      forEachChunk(items, (chunk) => {
        db.insert(faces)
          .values(chunk.map((item) => ({
            mediaId: Number(item.mediaId),
            timestamp: item.timestamp ?? null,
            score: item.score ?? 0,
            x: item.x ?? 0,
            y: item.y ?? 0,
            width: item.width ?? 0,
            height: item.height ?? 0,
            cropPath: item.cropPath ?? null,
            createdAt: item.createdAt ?? createdAt,
          })))
          .run()
      })
    },

    findByMediaId(mediaId: number): FaceRow[] {
      return db.select().from(faces).where(eq(faces.mediaId, mediaId)).all()
    },

    countAll(): number {
      const row = db.select({count: count()}).from(faces).get()
      return Number(row?.count ?? 0)
    },

    countDistinctMediaIds(): number {
      const row = db.select({
        count: sql<number>`count(distinct ${faces.mediaId})`,
      }).from(faces).get()
      return Number(row?.count ?? 0)
    },

    findDistinctMediaIds(): number[] {
      const rows = db.selectDistinct({mediaId: faces.mediaId}).from(faces).all()
      return rows.map((row) => Number(row.mediaId)).filter((id) => Number.isFinite(id))
    },

    deleteByMediaId(mediaId: number): number {
      const result = db.delete(faces).where(eq(faces.mediaId, mediaId)).run()
      return Number(result.changes ?? 0)
    },

    deleteByMediaIds(mediaIds: number[]): number {
      if (!mediaIds.length) return 0
      let removed = 0
      forEachChunk(mediaIds, (chunk) => {
        const result = db.delete(faces).where(inArray(faces.mediaId, chunk)).run()
        removed += Number(result.changes ?? 0)
      })
      return removed
    },
  }
}
