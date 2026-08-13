import { and, asc, count, eq, gt, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'
import type { DrizzleClient } from '../client'
import { marks } from '../schema/marks'
import { media } from '../schema/media'
import { meta } from '../schema/meta'
import { tags } from '../schema/tags'
import { forEachChunk } from '../utils/chunk'

const notDeleted = or(isNull(marks.deletedAt), eq(marks.deletedAt, ''))

export type MarkRow = typeof marks.$inferSelect
export type MarkInsert = typeof marks.$inferInsert

/** Markers / thumb tasks only need identity + path for nested media. */
const MARK_MEDIA_COLUMNS = {
  id: media.id,
  path: media.path,
  name: media.name,
  basename: media.basename,
  ext: media.ext,
  mediaTypeId: media.mediaTypeId,
} as const

export type MarkMediaProjection = {
  id: number
  path: string
  name: string | null
  basename: string | null
  ext: string | null
  mediaTypeId: number | null
}

type MarkWithRelations = MarkRow & {
  tag: (typeof tags.$inferSelect & {meta: typeof meta.$inferSelect | null}) | null
  media: MarkMediaProjection | null
}

function mapClipRow(row: {
  markId: number
  time: number | null
  end: number | null
  mediaId: number
  path: string
  name: string | null
  basename: string | null
  mediaTypeId: number | null
}) {
  const segmentStart = Number(row.time) || 0
  const segmentEnd = Number(row.end)
  return {
    id: row.mediaId,
    markId: row.markId,
    path: row.path,
    name: row.name || row.basename || undefined,
    basename: row.basename ?? undefined,
    mediaTypeId: row.mediaTypeId ?? undefined,
    segmentStart,
    segmentEnd,
    time: segmentStart,
  }
}

function hydrateMarksWithRelations(
  db: DrizzleClient,
  rows: MarkRow[],
): MarkWithRelations[] {
  if (!rows.length) return []

  const tagIds = [...new Set(rows.map((row) => row.tagId).filter((id): id is number => id != null))]
  const mediaIds = [...new Set(rows.map((row) => row.mediaId).filter((id): id is number => id != null))]

  const tagRows = tagIds.length
    ? db.select().from(tags).where(inArray(tags.id, tagIds)).all()
    : []
  const mediaRows = mediaIds.length
    ? db.select(MARK_MEDIA_COLUMNS).from(media).where(inArray(media.id, mediaIds)).all()
    : []
  const metaIds = [...new Set(tagRows.map((tag) => tag.metaId).filter((id): id is number => id != null))]
  const metaRows = metaIds.length
    ? db.select().from(meta).where(inArray(meta.id, metaIds)).all()
    : []

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
      media: medium ?? null,
    }
  })
}

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
          icon: data.icon ?? null,
        })
        .returning()
        .get()
    },

    findById(id: number): MarkRow | undefined {
      return db.select().from(marks).where(eq(marks.id, id)).get()
    },

    updateById(id: number, data: Partial<MarkInsert>): MarkRow | undefined {
      return db.update(marks)
        .set({
          type: data.type ?? null,
          text: data.text ?? null,
          time: data.time ?? null,
          end: data.end ?? null,
          tagId: data.tagId ?? null,
          mediaId: data.mediaId ?? null,
          icon: data.icon ?? null,
        })
        .where(eq(marks.id, id))
        .returning()
        .get()
    },

    bulkCreate(items: Array<Partial<MarkInsert>>): void {
      if (!items.length) return

      forEachChunk(items, (chunk) => {
        db.insert(marks)
          .values(chunk.map((item) => ({
            type: item.type ?? null,
            text: item.text ?? null,
            time: item.time ?? null,
            end: item.end ?? null,
            tagId: item.tagId ?? null,
            mediaId: item.mediaId ?? null,
            icon: item.icon ?? null,
          })))
          .run()
      })
    },

    findIdsByMediaId(mediaId: unknown): Array<{id: number}> {
      return db.select({id: marks.id})
        .from(marks)
        .where(and(eq(marks.mediaId, Number(mediaId)), notDeleted))
        .all()
    },

    findByIdAndMediaId(markId: number, mediaId: number): MarkRow | undefined {
      return db.select()
        .from(marks)
        .where(and(eq(marks.id, markId), eq(marks.mediaId, mediaId), notDeleted))
        .get()
    },

    findAllIds(): Array<{id: number}> {
      return db.select({id: marks.id}).from(marks).where(notDeleted).all()
    },

    countAll(): number {
      const row = db.select({count: count()}).from(marks).where(notDeleted).get()
      return Number(row?.count ?? 0)
    },

    /** How many of `ids` exist as marks (chunked IN). */
    countByIds(ids: number[]): number {
      const unique = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))]
      if (!unique.length) return 0

      let total = 0
      forEachChunk(unique, (chunk) => {
        const row = db.select({count: count()})
          .from(marks)
          .where(inArray(marks.id, chunk))
          .get()
        total += Number(row?.count ?? 0)
      })
      return total
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
        ? db.select(MARK_MEDIA_COLUMNS).from(media).where(eq(media.id, row.mediaId)).get()
        : null

      return {
        ...row,
        media: medium ?? null,
      }
    },

    findIdsByTagId(tagId: unknown): Array<{id: number}> {
      return db.select({id: marks.id})
        .from(marks)
        .where(and(eq(marks.tagId, Number(tagId)), notDeleted))
        .all()
    },

    countClipsByTagId(tagId: unknown): number {
      const row = db.select({count: count()})
        .from(marks)
        .where(and(
          eq(marks.tagId, Number(tagId)),
          isNotNull(marks.end),
          notDeleted,
        ))
        .get()
      return Number(row?.count ?? 0)
    },

    countClipsByMarkIds(markIds: number[]): number {
      const ids = [...new Set(markIds.map(Number).filter((id) => Number.isFinite(id) && id > 0))]
      if (!ids.length) return 0
      const row = db.select({count: count()})
        .from(marks)
        .where(and(
          inArray(marks.id, ids),
          isNotNull(marks.end),
          notDeleted,
        ))
        .get()
      return Number(row?.count ?? 0)
    },

    findClipsByTagId(
      tagId: unknown,
      options: {limit?: number; offset?: number; sort?: 'time' | 'shuffle' | 'selection'} = {},
    ) {
      const resolvedTagId = Number(tagId)
      // Tag-scoped queries have no selection order — fall back to time.
      const sort = options.sort === 'shuffle' ? 'shuffle' : 'time'

      let query = db
        .select({
          markId: marks.id,
          time: marks.time,
          end: marks.end,
          mediaId: media.id,
          path: media.path,
          name: media.name,
          basename: media.basename,
          mediaTypeId: media.mediaTypeId,
        })
        .from(marks)
        .innerJoin(media, eq(media.id, marks.mediaId))
        .where(and(
          eq(marks.tagId, resolvedTagId),
          isNotNull(marks.end),
          notDeleted,
        ))

      if (sort === 'shuffle') {
        query = query.orderBy(sql`RANDOM()`) as typeof query
      } else {
        query = query.orderBy(
          asc(marks.time),
          sql`LOWER(COALESCE(${media.name}, ${media.basename}, ''))`,
          asc(marks.id),
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

      return query.all().map(mapClipRow)
    },

    findClipsByMarkIds(
      markIds: number[],
      options: {limit?: number; offset?: number; sort?: 'time' | 'shuffle' | 'selection'} = {},
    ) {
      const orderedIds: number[] = []
      const seen = new Set<number>()
      for (const raw of markIds) {
        const id = Number(raw)
        if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue
        seen.add(id)
        orderedIds.push(id)
      }
      if (!orderedIds.length) return []

      const sort = options.sort === 'shuffle'
        ? 'shuffle'
        : options.sort === 'selection'
          ? 'selection'
          : 'time'

      let query = db
        .select({
          markId: marks.id,
          time: marks.time,
          end: marks.end,
          mediaId: media.id,
          path: media.path,
          name: media.name,
          basename: media.basename,
          mediaTypeId: media.mediaTypeId,
        })
        .from(marks)
        .innerJoin(media, eq(media.id, marks.mediaId))
        .where(and(
          inArray(marks.id, orderedIds),
          isNotNull(marks.end),
          notDeleted,
        ))

      if (sort === 'shuffle') {
        query = query.orderBy(sql`RANDOM()`) as typeof query
      } else if (sort !== 'selection') {
        query = query.orderBy(
          asc(marks.time),
          sql`LOWER(COALESCE(${media.name}, ${media.basename}, ''))`,
          asc(marks.id),
        ) as typeof query
      }

      const limit = Number(options.limit)
      const hasLimit = Number.isFinite(limit) && limit > 0
      const offset = Number(options.offset)
      const hasOffset = Number.isFinite(offset) && offset > 0

      if (sort !== 'selection') {
        if (hasLimit || hasOffset) {
          query = query.limit(hasLimit ? Math.min(Math.floor(limit), 10_000) : 10_000) as typeof query
        }
        if (hasOffset) {
          query = query.offset(Math.floor(offset)) as typeof query
        }
        return query.all().map(mapClipRow)
      }

      const byMarkId = new Map(
        query.all().map(mapClipRow).map((clip) => [clip.markId, clip]),
      )
      let ordered = orderedIds
        .map((id) => byMarkId.get(id))
        .filter((clip): clip is NonNullable<typeof clip> => clip != null)

      if (hasOffset) {
        ordered = ordered.slice(Math.floor(offset))
      }
      if (hasLimit) {
        ordered = ordered.slice(0, Math.min(Math.floor(limit), 10_000))
      } else if (hasOffset) {
        ordered = ordered.slice(0, 10_000)
      }

      return ordered
    },

    convertMetaMarksToBookmarksByTagId(tagId: unknown, text: string): void {
      db.update(marks)
        .set({
          type: 'bookmark',
          text: text || null,
          tagId: null,
          icon: 'bookmark',
        })
        .where(eq(marks.tagId, Number(tagId)))
        .run()
    },

    findAllForVideo(mediaId: number) {
      const rows = db.select()
        .from(marks)
        .where(and(eq(marks.mediaId, mediaId), notDeleted))
        .orderBy(asc(marks.time))
        .all()

      const tagIds = [...new Set(rows.map((row) => row.tagId).filter((id): id is number => id != null))]
      const allTags = tagIds.length
        ? db.select().from(tags).where(inArray(tags.id, tagIds)).all()
        : []
      const tagById = new Map(allTags.map((tag) => [tag.id, tag]))

      const metaIds = [...new Set(allTags.map((tag) => tag.metaId).filter((id): id is number => id != null))]
      const metaRows = metaIds.length
        ? db.select().from(meta).where(inArray(meta.id, metaIds)).all()
        : []
      const metaById = new Map(metaRows.map((row) => [row.id, row]))

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
      const rows = db.select().from(marks).where(notDeleted).all()
      return hydrateMarksWithRelations(db, rows)
    },

    findByIdsWithRelations(ids: number[]) {
      if (!ids.length) return []
      const unique = [...new Set(ids.filter((id) => Number.isFinite(id)))]
      if (!unique.length) return []
      const rows = db.select().from(marks).where(inArray(marks.id, unique)).all()
      const hydrated = hydrateMarksWithRelations(db, rows)
      const byId = new Map(hydrated.map((row) => [row.id, row]))
      return ids
        .map((id) => byId.get(id))
        .filter((row): row is MarkWithRelations => row != null)
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

      return hydrateMarksWithRelations(db, rows)
    },
  }
}
