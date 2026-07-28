import { and, count, eq, inArray } from 'drizzle-orm'
import type { DrizzleClient } from '../client'
import { faceEnrollments } from '../schema/faceEnrollments'
import { forEachChunk } from '../utils/chunk'

export type FaceEnrollmentRow = typeof faceEnrollments.$inferSelect
export type FaceEnrollmentInsert = typeof faceEnrollments.$inferInsert

export function createFaceEnrollmentsRepository(db: DrizzleClient) {
  return {
    create(data: Partial<FaceEnrollmentInsert>): FaceEnrollmentRow {
      return db.insert(faceEnrollments)
        .values({
          tagId: Number(data.tagId),
          metaId: Number(data.metaId),
          source: String(data.source || 'tagImage'),
          sourcePath: data.sourcePath ?? null,
          embedding: String(data.embedding || '[]'),
          createdAt: data.createdAt ?? new Date().toISOString(),
        })
        .returning()
        .get()
    },

    findByMetaId(metaId: number): FaceEnrollmentRow[] {
      return db.select().from(faceEnrollments).where(eq(faceEnrollments.metaId, metaId)).all()
    },

    findByTagId(tagId: number): FaceEnrollmentRow[] {
      return db.select().from(faceEnrollments).where(eq(faceEnrollments.tagId, tagId)).all()
    },

    countByMetaId(metaId: number): number {
      const row = db.select({count: count()})
        .from(faceEnrollments)
        .where(eq(faceEnrollments.metaId, metaId))
        .get()
      return Number(row?.count ?? 0)
    },

    countDistinctTagsByMetaId(metaId: number): number {
      const rows = db.selectDistinct({tagId: faceEnrollments.tagId})
        .from(faceEnrollments)
        .where(eq(faceEnrollments.metaId, metaId))
        .all()
      return rows.length
    },

    deleteByTagId(tagId: number): number {
      const result = db.delete(faceEnrollments).where(eq(faceEnrollments.tagId, tagId)).run()
      return Number(result.changes ?? 0)
    },

    deleteByMetaId(metaId: number): number {
      const result = db.delete(faceEnrollments).where(eq(faceEnrollments.metaId, metaId)).run()
      return Number(result.changes ?? 0)
    },

    deleteAll(): number {
      const result = db.delete(faceEnrollments).run()
      return Number(result.changes ?? 0)
    },

    deleteByIds(ids: number[]): number {
      if (!ids.length) return 0
      let removed = 0
      forEachChunk(ids, (chunk) => {
        const result = db.delete(faceEnrollments).where(inArray(faceEnrollments.id, chunk)).run()
        removed += Number(result.changes ?? 0)
      })
      return removed
    },

    replaceForTag(tagId: number, metaId: number, items: Array<Partial<FaceEnrollmentInsert>>): void {
      db.delete(faceEnrollments).where(and(
        eq(faceEnrollments.tagId, tagId),
        eq(faceEnrollments.metaId, metaId),
      )).run()
      if (!items.length) return
      const createdAt = new Date().toISOString()
      forEachChunk(items, (chunk) => {
        db.insert(faceEnrollments)
          .values(chunk.map((item) => ({
            tagId,
            metaId,
            source: String(item.source || 'tagImage'),
            sourcePath: item.sourcePath ?? null,
            embedding: String(item.embedding || '[]'),
            createdAt: item.createdAt ?? createdAt,
          })))
          .run()
      })
    },
  }
}
