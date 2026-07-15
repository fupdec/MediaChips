import { and, asc, count, desc, eq, gt, inArray, isNull, like, or, sql } from 'drizzle-orm'
import type { DrizzleClient } from '../client'
import { media } from '../schema/media'
import { tagsInMedia } from '../schema/tagsInMedia'
import { nowIso } from '../utils/timestamps'
import { queryGet } from '../utils/rawQuery'
import type { ApiDb } from '../../types/db'
import { buildFolderPathLikePatterns } from '../../utils/watcherFolderPaths'

export type MediaRow = typeof media.$inferSelect
export type MediaInsert = typeof media.$inferInsert
export type MediaPathEntry = Pick<MediaRow, 'id' | 'path' | 'mediaTypeId'>

const MEDIA_MUTABLE_COLUMNS = new Set([
  'path', 'basename', 'name', 'ext', 'filesize', 'contentHash', 'oshash', 'rating', 'favorite',
  'bookmark', 'views', 'oldId', 'viewedAt', 'mediaTypeId',
])

function pickMediaFields(data: Record<string, unknown>): Partial<MediaInsert> {
  const picked: Partial<MediaInsert> = {}
  for (const [key, value] of Object.entries(data)) {
    if (MEDIA_MUTABLE_COLUMNS.has(key)) {
      (picked as Record<string, unknown>)[key] = value
    }
  }
  return picked
}

export function createMediaRepository(db: DrizzleClient) {
  return {
    findById(id: number): MediaRow | undefined {
      return db.select().from(media).where(eq(media.id, id)).get()
    },

    findAllRaw(): MediaRow[] {
      return db.select().from(media).all()
    },

    findAllOrderedById(): MediaRow[] {
      return db.select().from(media).orderBy(asc(media.id)).all()
    },

    findByPaths(paths: string[], mediaTypeId?: number): MediaRow[] {
      if (!paths.length) return []

      const where = mediaTypeId != null
        ? and(inArray(media.path, paths), eq(media.mediaTypeId, mediaTypeId))
        : inArray(media.path, paths)

      return db.select().from(media).where(where).all()
    },

    findByMediaTypeIds(typeIds: number[]): MediaRow[] {
      if (!typeIds.length) return []

      return db.select()
        .from(media)
        .where(inArray(media.mediaTypeId, typeIds))
        .all()
    },

    findPathEntriesByMediaTypeIds(typeIds: number[]): MediaPathEntry[] {
      if (!typeIds.length) return []

      return db.select({
        id: media.id,
        path: media.path,
        mediaTypeId: media.mediaTypeId,
      })
        .from(media)
        .where(inArray(media.mediaTypeId, typeIds))
        .all()
    },

    findPathEntriesByMediaTypeIdsUnderFolder(
      typeIds: number[],
      folderPath: string,
    ): MediaPathEntry[] {
      if (!typeIds.length) return []

      const patterns = buildFolderPathLikePatterns(folderPath)
      if (!patterns.length) {
        return this.findPathEntriesByMediaTypeIds(typeIds)
      }

      const pathConditions = patterns.map((pattern) => like(media.path, pattern))

      return db.select({
        id: media.id,
        path: media.path,
        mediaTypeId: media.mediaTypeId,
      })
        .from(media)
        .where(and(
          inArray(media.mediaTypeId, typeIds),
          or(...pathConditions),
        ))
        .all()
    },

    findByMediaType(
      mediaTypeId: number,
      options: {limit?: number; orderByCreatedDesc?: boolean} = {},
    ): MediaRow[] {
      let query = db.select().from(media).where(eq(media.mediaTypeId, mediaTypeId))

      if (options.orderByCreatedDesc) {
        query = query.orderBy(desc(media.createdAt)) as typeof query
      }

      if (options.limit) {
        query = query.limit(options.limit) as typeof query
      }

      return query.all()
    },

    searchByPathLike(query: string): MediaRow[] {
      return db.select()
        .from(media)
        .where(sql`${media.path} LIKE ${`%${query}%`}`)
        .all()
    },

    findByPathVariants(variants: string[]): MediaRow | undefined {
      if (!variants.length) return undefined

      const conditions = variants.map((variant) =>
        sql`lower(${media.path}) = ${variant.toLowerCase()}`,
      )

      return db.select()
        .from(media)
        .where(or(...conditions))
        .get()
    },

    findByContentHash(contentHash: string, mediaTypeId?: unknown): MediaRow | undefined {
      const hash = String(contentHash || '').trim()
      if (!hash) return undefined

      const conditions = [eq(media.contentHash, hash)]
      if (mediaTypeId != null && mediaTypeId !== '') {
        conditions.push(eq(media.mediaTypeId, Number(mediaTypeId)))
      }

      return db.select()
        .from(media)
        .where(and(...conditions))
        .get()
    },

    findByOshash(oshash: string, mediaTypeId?: unknown): MediaRow | undefined {
      const hash = String(oshash || '').trim()
      if (!hash) return undefined

      const conditions = [eq(media.oshash, hash)]
      if (mediaTypeId != null && mediaTypeId !== '') {
        conditions.push(eq(media.mediaTypeId, Number(mediaTypeId)))
      }

      return db.select()
        .from(media)
        .where(and(...conditions))
        .get()
    },

    findByBasenameFilesizeAndMediaType(
      basename: string,
      filesize: number,
      mediaTypeId: unknown,
    ): MediaRow | undefined {
      if (!basename) return undefined

      return db.select()
        .from(media)
        .where(and(
          eq(media.basename, basename),
          eq(media.filesize, filesize),
          eq(media.mediaTypeId, Number(mediaTypeId)),
        ))
        .get()
    },

    findLegacyHashCandidates(
      filesize: number,
      mediaTypeId: unknown,
      basename?: string | null,
    ): MediaRow[] {
      const conditions = [
        eq(media.filesize, filesize),
        eq(media.mediaTypeId, Number(mediaTypeId)),
        or(isNull(media.contentHash), eq(media.contentHash, '')),
      ]

      if (basename) {
        conditions.push(eq(media.basename, basename))
      }

      return db.select()
        .from(media)
        .where(and(...conditions))
        .all()
    },

    findOrCreateByPath(pathValue: string, defaults: Partial<MediaInsert>): {row: MediaRow; created: boolean} {
      const existing = db.select().from(media).where(eq(media.path, pathValue)).get()
      if (existing) {
        return {row: existing, created: false}
      }

      const timestamp = nowIso()
      const row = db.insert(media)
        .values({
          path: pathValue,
          basename: defaults.basename ?? null,
          name: defaults.name ?? null,
          ext: defaults.ext ?? null,
          filesize: defaults.filesize ?? 0,
          contentHash: defaults.contentHash ?? null,
          mediaTypeId: defaults.mediaTypeId == null ? null : Number(defaults.mediaTypeId),
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .returning()
        .get()

      return {row, created: true}
    },

    create(defaults: Partial<MediaInsert>): MediaRow {
      const timestamp = nowIso()
      return db.insert(media)
        .values({
          path: defaults.path ?? '',
          basename: defaults.basename ?? null,
          name: defaults.name ?? null,
          ext: defaults.ext ?? null,
          filesize: defaults.filesize ?? 0,
          contentHash: defaults.contentHash ?? null,
          mediaTypeId: defaults.mediaTypeId == null ? null : Number(defaults.mediaTypeId),
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .returning()
        .get()
    },

    bulkCreate(items: Array<Partial<MediaInsert>>): void {
      if (!items.length) return

      const timestamp = nowIso()
      db.insert(media)
        .values(items.map((item) => ({
          path: item.path ?? '',
          basename: item.basename ?? null,
          name: item.name ?? null,
          ext: item.ext ?? null,
          filesize: item.filesize ?? 0,
          contentHash: item.contentHash ?? null,
          rating: item.rating ?? 0,
          favorite: item.favorite ?? false,
          bookmark: item.bookmark ?? null,
          views: item.views ?? 0,
          oldId: item.oldId == null ? null : String(item.oldId),
          mediaTypeId: item.mediaTypeId == null ? null : Number(item.mediaTypeId),
          createdAt: item.createdAt ?? timestamp,
          updatedAt: item.updatedAt ?? timestamp,
        })))
        .run()
    },

    findOldIdMappings(): Array<{id: number; oldId: string | null}> {
      return db.select({id: media.id, oldId: media.oldId}).from(media).all()
    },

    updateById(id: number, data: Record<string, unknown>, options: {silent?: boolean} = {}): void {
      const payload = pickMediaFields(data)
      if (!options.silent) {
        payload.updatedAt = nowIso()
      }

      db.update(media)
        .set(payload)
        .where(eq(media.id, id))
        .run()
    },

    deleteById(id: number): void {
      db.delete(media).where(eq(media.id, id)).run()
    },

    countAll(): number {
      const row = db.select({count: count()}).from(media).get()
      return Number(row?.count ?? 0)
    },

    countPendingContentHash(): number {
      const row = db.select({count: count()})
        .from(media)
        .where(or(isNull(media.contentHash), eq(media.contentHash, '')))
        .get()
      return Number(row?.count ?? 0)
    },

    findNextForBackfill(lastId: number, force = false): MediaRow | undefined {
      if (force) {
        return db.select()
          .from(media)
          .where(gt(media.id, lastId))
          .orderBy(media.id)
          .limit(1)
          .get()
      }

      return db.select()
        .from(media)
        .where(and(
          gt(media.id, lastId),
          or(isNull(media.contentHash), eq(media.contentHash, '')),
        ))
        .orderBy(media.id)
        .limit(1)
        .get()
    },

    countForBackfill(force = false): number {
      if (force) {
        return this.countAll()
      }
      return this.countPendingContentHash()
    },

    countWithTag(mediaTypeId: unknown, tagId: unknown): number {
      const row = db.select({count: count()})
        .from(media)
        .innerJoin(tagsInMedia, eq(tagsInMedia.mediaId, media.id))
        .where(and(
          eq(media.mediaTypeId, Number(mediaTypeId)),
          eq(tagsInMedia.tagId, Number(tagId)),
        ))
        .get()
      return Number(row?.count ?? 0)
    },

    getStats(apiDb: ApiDb): {total: number; filesize: number} {
      const row = queryGet<{total: number; filesize: number}>(apiDb, `
        SELECT
          COUNT(*) AS total,
          COALESCE(SUM(filesize), 0) AS filesize
        FROM media
      `)

      return {
        total: Number(row?.total ?? 0),
        filesize: Number(row?.filesize ?? 0),
      }
    },

    findPaths(): string[] {
      return db.select({path: media.path}).from(media).all()
        .map((row) => row.path)
        .filter((pathValue): pathValue is string => Boolean(pathValue))
    },

    findIdsByMediaType(mediaTypeId: number): Array<{id: number}> {
      return db.select({id: media.id})
        .from(media)
        .where(eq(media.mediaTypeId, mediaTypeId))
        .all()
    },

    countByMediaType(mediaTypeId: number): number {
      const row = db.select({count: count()})
        .from(media)
        .where(eq(media.mediaTypeId, mediaTypeId))
        .get()
      return Number(row?.count ?? 0)
    },

    findNextByMediaTypeAfterId(mediaTypeId: number, lastId: number): MediaRow | undefined {
      return db.select()
        .from(media)
        .where(and(
          eq(media.mediaTypeId, mediaTypeId),
          gt(media.id, lastId),
        ))
        .orderBy(asc(media.id))
        .limit(1)
        .get()
    },

    updateByIds(ids: number[], data: Record<string, unknown>, options: {silent?: boolean} = {}): void {
      if (!ids.length) return

      const payload = pickMediaFields(data)
      if (!options.silent) {
        payload.updatedAt = nowIso()
      }

      db.update(media)
        .set(payload)
        .where(inArray(media.id, ids))
        .run()
    },
  }
}
