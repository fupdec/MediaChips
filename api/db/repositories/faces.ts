import { and, asc, count, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import type { DrizzleClient } from '../client'
import { faces } from '../schema/faces'
import { media } from '../schema/media'
import { forEachChunk } from '../utils/chunk'

export type FaceRow = typeof faces.$inferSelect
export type FaceInsert = typeof faces.$inferInsert

export type FaceAppearanceRow = {
  faceId: number
  mediaId: number
  timestamp: string | null
  matchScore: number | null
  cropPath: string | null
  path: string
  name: string | null
  basename: string | null
  mediaTypeId: number | null
  mediaCreatedAt: string
}

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

    countByTagId(tagId: unknown): number {
      const resolvedTagId = Number(tagId)
      if (!Number.isFinite(resolvedTagId) || resolvedTagId <= 0) return 0
      const row = db.select({count: count()})
        .from(faces)
        .where(eq(faces.tagId, resolvedTagId))
        .get()
      return Number(row?.count ?? 0)
    },

    findByTagId(
      tagId: unknown,
      options: {limit?: number; offset?: number; sort?: 'time' | 'shuffle'} = {},
    ): FaceAppearanceRow[] {
      const resolvedTagId = Number(tagId)
      if (!Number.isFinite(resolvedTagId) || resolvedTagId <= 0) return []

      const sort = options.sort === 'shuffle' ? 'shuffle' : 'time'

      let query = db
        .select({
          faceId: faces.id,
          mediaId: faces.mediaId,
          timestamp: faces.timestamp,
          matchScore: faces.matchScore,
          cropPath: faces.cropPath,
          path: media.path,
          name: media.name,
          basename: media.basename,
          mediaTypeId: media.mediaTypeId,
          mediaCreatedAt: media.createdAt,
        })
        .from(faces)
        .innerJoin(media, eq(media.id, faces.mediaId))
        .where(eq(faces.tagId, resolvedTagId))

      if (sort === 'shuffle') {
        query = query.orderBy(sql`RANDOM()`) as typeof query
      } else {
        query = query.orderBy(
          asc(media.createdAt),
          sql`LOWER(COALESCE(${media.name}, ${media.basename}, ''))`,
          asc(faces.timestamp),
          asc(faces.id),
        ) as typeof query
      }

      const limit = Number(options.limit)
      const hasLimit = Number.isFinite(limit) && limit > 0
      const offset = Number(options.offset)
      const hasOffset = Number.isFinite(offset) && offset > 0

      // SQLite rejects OFFSET without LIMIT; use the same cap as an explicit limit.
      if (hasLimit || hasOffset) {
        query = query.limit(hasLimit ? Math.min(Math.floor(limit), 10_000) : 10_000) as typeof query
      }
      if (hasOffset) {
        query = query.offset(Math.floor(offset)) as typeof query
      }

      return query.all()
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
