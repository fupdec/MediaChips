import { and, asc, count, eq, gt, isNotNull, sql } from 'drizzle-orm'
import type { DrizzleClient } from '../client'
import { marks } from '../schema/marks'
import { media } from '../schema/media'
import { meta } from '../schema/meta'
import { tags } from '../schema/tags'

export type MarkRow = typeof marks.$inferSelect
export type MarkInsert = typeof marks.$inferInsert

export function createMarksRepository(db: DrizzleClient) {
  return {
    create(data: Partial<MarkInsert>): MarkRow {
      return db.insert(marks)
        .values({
          type: data.type ?? null,
          text: data.text ?? null,
          time: data.time ?? null,
          end: data.end ?? null,
          tagId: data.tagId ?? null,
          mediaId: data.mediaId ?? null,
        })
        .returning()
        .get()
    },

    bulkCreate(items: Array<Partial<MarkInsert>>): void {
      if (!items.length) return

      db.insert(marks)
        .values(items.map((item) => ({
          type: item.type ?? null,
          text: item.text ?? null,
          time: item.time ?? null,
          end: item.end ?? null,
          tagId: item.tagId ?? null,
          mediaId: item.mediaId ?? null,
        })))
        .run()
    },

    findIdsByMediaId(mediaId: unknown): Array<{id: number}> {
      return db.select({id: marks.id})
        .from(marks)
        .where(eq(marks.mediaId, Number(mediaId)))
        .all()
    },

    findByIdAndMediaId(markId: number, mediaId: number): MarkRow | undefined {
      return db.select()
        .from(marks)
        .where(and(eq(marks.id, markId), eq(marks.mediaId, mediaId)))
        .get()
    },

    findAllIds(): Array<{id: number}> {
      return db.select({id: marks.id}).from(marks).all()
    },

    countAll(): number {
      const row = db.select({count: count()}).from(marks).get()
      return Number(row?.count ?? 0)
    },

    findNextWithMediaAfterId(lastId: number) {
      const row = db.select()
        .from(marks)
        .where(gt(marks.id, lastId))
        .orderBy(asc(marks.id))
        .limit(1)
        .get()

      if (!row) return null

      const medium = row.mediaId
        ? db.select().from(media).where(eq(media.id, row.mediaId)).get()
        : null

      return {
        ...row,
        media: medium,
      }
    },

    findIdsByTagId(tagId: unknown): Array<{id: number}> {
      return db.select({id: marks.id})
        .from(marks)
        .where(eq(marks.tagId, Number(tagId)))
        .all()
    },

    countClipsByTagId(tagId: unknown): number {
      const row = db.select({count: count()})
        .from(marks)
        .where(and(
          eq(marks.tagId, Number(tagId)),
          isNotNull(marks.end),
        ))
        .get()
      return Number(row?.count ?? 0)
    },

    findClipsByTagId(tagId: unknown) {
      const rows = db.select()
        .from(marks)
        .where(and(
          eq(marks.tagId, Number(tagId)),
          isNotNull(marks.end),
        ))
        .orderBy(asc(marks.time), asc(marks.id))
        .all()

      const mediaIds = [...new Set(rows.map((row) => row.mediaId).filter((id): id is number => id != null))]
      const mediaRows = mediaIds.length
        ? db.select().from(media).all().filter((item) => mediaIds.includes(item.id))
        : []
      const mediaById = new Map(mediaRows.map((item) => [item.id, item]))

      return rows
        .map((row) => {
          const medium = row.mediaId != null ? mediaById.get(row.mediaId) : null
          if (!medium) return null
          const segmentStart = Number(row.time) || 0
          const segmentEnd = Number(row.end)
          return {
            id: medium.id,
            markId: row.id,
            path: medium.path,
            name: medium.name || medium.basename || undefined,
            basename: medium.basename ?? undefined,
            mediaTypeId: medium.mediaTypeId ?? undefined,
            segmentStart,
            segmentEnd,
            time: segmentStart,
          }
        })
        .filter((item): item is NonNullable<typeof item> => item != null)
        .sort((a, b) => {
          if (a.segmentStart !== b.segmentStart) return a.segmentStart - b.segmentStart
          const nameA = (a.name || '').toLowerCase()
          const nameB = (b.name || '').toLowerCase()
          if (nameA !== nameB) return nameA.localeCompare(nameB)
          return a.markId - b.markId
        })
    },

    convertMetaMarksToBookmarksByTagId(tagId: unknown, text: string): void {
      db.update(marks)
        .set({
          type: 'bookmark',
          text: text || null,
          tagId: null,
        })
        .where(eq(marks.tagId, Number(tagId)))
        .run()
    },

    findAllForVideo(mediaId: number) {
      const rows = db.select()
        .from(marks)
        .where(eq(marks.mediaId, mediaId))
        .orderBy(asc(marks.time))
        .all()

      const tagIds = [...new Set(rows.map((row) => row.tagId).filter((id): id is number => id != null))]
      const allTags = tagIds.length
        ? db.select().from(tags).all().filter((tag) => tagIds.includes(tag.id))
        : []
      const tagById = new Map(allTags.map((tag) => [tag.id, tag]))

      const metaIds = [...new Set(allTags.map((tag) => tag.metaId).filter((id): id is number => id != null))]
      const metaRows = metaIds.length ? db.select().from(meta).all() : []
      const metaById = new Map(metaRows.filter((row) => metaIds.includes(row.id)).map((row) => [row.id, row]))

      return rows.map((row) => {
        const tag = row.tagId ? tagById.get(row.tagId) : null
        const metaRow = tag?.metaId ? metaById.get(tag.metaId) ?? null : null
        return {
          ...row,
          'tag.name': tag?.name ?? null,
          'tag.color': tag?.color ?? null,
          'tag.metaId': tag?.metaId ?? null,
          meta: metaRow,
        }
      })
    },

    findAllWithRelations() {
      const rows = db.select().from(marks).all()
      const tagIds = [...new Set(rows.map((row) => row.tagId).filter((id): id is number => id != null))]
      const mediaIds = [...new Set(rows.map((row) => row.mediaId).filter((id): id is number => id != null))]

      const tagRows = tagIds.length ? db.select().from(tags).all().filter((tag) => tagIds.includes(tag.id)) : []
      const mediaRows = mediaIds.length ? db.select().from(media).all().filter((item) => mediaIds.includes(item.id)) : []
      const metaIds = [...new Set(tagRows.map((tag) => tag.metaId).filter((id): id is number => id != null))]
      const metaRows = metaIds.length ? db.select().from(meta).all().filter((row) => metaIds.includes(row.id)) : []

      const tagById = new Map(tagRows.map((tag) => [tag.id, tag]))
      const mediaById = new Map(mediaRows.map((item) => [item.id, item]))
      const metaById = new Map(metaRows.map((row) => [row.id, row]))

      return rows.map((row) => {
        const tag = row.tagId ? tagById.get(row.tagId) : null
        const medium = row.mediaId ? mediaById.get(row.mediaId) : null
        return {
          ...row,
          tag: tag
            ? {
              ...tag,
              meta: tag.metaId ? metaById.get(tag.metaId) ?? null : null,
            }
            : null,
          media: medium,
        }
      })
    },

    deleteById(id: number): void {
      db.delete(marks).where(eq(marks.id, id)).run()
    },

    findRandomWithRelations(limit: number) {
      const rows = db.select()
        .from(marks)
        .orderBy(sql`RANDOM()`)
        .limit(limit)
        .all()

      const tagIds = [...new Set(rows.map((row) => row.tagId).filter((id): id is number => id != null))]
      const mediaIds = [...new Set(rows.map((row) => row.mediaId).filter((id): id is number => id != null))]

      const tagRows = tagIds.length ? db.select().from(tags).all().filter((tag) => tagIds.includes(tag.id)) : []
      const mediaRows = mediaIds.length ? db.select().from(media).all().filter((item) => mediaIds.includes(item.id)) : []
      const metaIds = [...new Set(tagRows.map((tag) => tag.metaId).filter((id): id is number => id != null))]
      const metaRows = metaIds.length ? db.select().from(meta).all().filter((row) => metaIds.includes(row.id)) : []

      const tagById = new Map(tagRows.map((tag) => [tag.id, tag]))
      const mediaById = new Map(mediaRows.map((item) => [item.id, item]))
      const metaById = new Map(metaRows.map((row) => [row.id, row]))

      return rows.map((row) => {
        const tag = row.tagId ? tagById.get(row.tagId) : null
        const medium = row.mediaId ? mediaById.get(row.mediaId) : null
        return {
          ...row,
          tag: tag
            ? {
              ...tag,
              meta: tag.metaId ? metaById.get(tag.metaId) ?? null : null,
            }
            : null,
          media: medium,
        }
      })
    },
  }
}
