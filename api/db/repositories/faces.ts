import { and, count, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
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
          embedding: data.embedding ?? null,
          tagId: data.tagId ?? null,
          matchScore: data.matchScore ?? null,
          matchStatus: data.matchStatus ?? null,
          createdAt: data.createdAt ?? new Date().toISOString(),
        })
        .returning()
        .get()
    },

    bulkCreate(items: Array<Partial<FaceInsert>>): FaceRow[] {
      if (!items.length) return []

      const createdAt = new Date().toISOString()
      const inserted: FaceRow[] = []
      forEachChunk(items, (chunk) => {
        const rows = db.insert(faces)
          .values(chunk.map((item) => ({
            mediaId: Number(item.mediaId),
            timestamp: item.timestamp ?? null,
            score: item.score ?? 0,
            x: item.x ?? 0,
            y: item.y ?? 0,
            width: item.width ?? 0,
            height: item.height ?? 0,
            cropPath: item.cropPath ?? null,
            embedding: item.embedding ?? null,
            tagId: item.tagId ?? null,
            matchScore: item.matchScore ?? null,
            matchStatus: item.matchStatus ?? null,
            createdAt: item.createdAt ?? createdAt,
          })))
          .returning()
          .all()
        inserted.push(...rows)
      })
      return inserted
    },

    findById(id: number): FaceRow | undefined {
      return db.select().from(faces).where(eq(faces.id, id)).get()
    },

    findByMediaId(mediaId: number): FaceRow[] {
      return db.select().from(faces).where(eq(faces.mediaId, mediaId)).all()
    },

    findUnmatched(limit = 500): FaceRow[] {
      return db.select()
        .from(faces)
        .where(and(
          isNull(faces.tagId),
          sql`(${faces.embedding} IS NOT NULL OR ${faces.cropPath} IS NOT NULL)`,
        ))
        .limit(limit)
        .all()
    },

    countAll(): number {
      const row = db.select({count: count()}).from(faces).get()
      return Number(row?.count ?? 0)
    },

    countMatched(): number {
      const row = db.select({count: count()})
        .from(faces)
        .where(sql`${faces.tagId} IS NOT NULL`)
        .get()
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

    updateMatch(id: number, data: {
      tagId?: number | null
      matchScore?: number | null
      matchStatus?: string | null
    }): void {
      db.update(faces)
        .set({
          tagId: data.tagId ?? null,
          matchScore: data.matchScore ?? null,
          matchStatus: data.matchStatus ?? null,
        })
        .where(eq(faces.id, id))
        .run()
    },

    clearMatchesByMediaId(mediaId: number): void {
      db.update(faces)
        .set({tagId: null, matchScore: null, matchStatus: null})
        .where(eq(faces.mediaId, mediaId))
        .run()
    },

    clearAllMatches(): number {
      const result = db.update(faces)
        .set({tagId: null, matchScore: null, matchStatus: null})
        .run()
      return Number(result.changes ?? 0)
    },

    updateCropPath(id: number, cropPath: string | null): void {
      db.update(faces)
        .set({cropPath})
        .where(eq(faces.id, id))
        .run()
    },

    clearCropPathsExceptMediaId(mediaId: number): number {
      const result = db.update(faces)
        .set({cropPath: null})
        .where(ne(faces.mediaId, mediaId))
        .run()
      return Number(result.changes ?? 0)
    },

    clearAllCropPaths(): number {
      const result = db.update(faces)
        .set({cropPath: null})
        .run()
      return Number(result.changes ?? 0)
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
