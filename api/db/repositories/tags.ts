import { count, eq, inArray } from 'drizzle-orm'
import type Database from 'better-sqlite3'
import type { DrizzleClient } from '../client'
import { tags } from '../schema/tags'
import { nowIso } from '../utils/timestamps'
import { mapChunks } from '../utils/chunk'

export type TagRow = typeof tags.$inferSelect
export type TagInsert = typeof tags.$inferInsert

/** Slim projection for GET /api/Tag bootstrap / chips catalog (drops oldId + timestamps). */
export type TagCatalogRow = Pick<
  TagRow,
  'id' | 'metaId' | 'name' | 'synonyms' | 'rating' | 'favorite' | 'bookmark' | 'country' | 'color' | 'views'
>

/** id/name/synonyms for marker title matching and similar lookups. */
export type TagLookupRow = Pick<TagRow, 'id' | 'name' | 'synonyms'>

const TAG_MUTABLE_COLUMNS = new Set([
  'name',
  'synonyms',
  'rating',
  'favorite',
  'bookmark',
  'country',
  'color',
  'views',
  'viewedAt',
  'metaId',
  'oldId',
])

function coerceTagField(key: string, value: unknown): unknown {
  switch (key) {
    case 'rating':
      return value == null || value === '' ? 0 : Math.round(Number(value)) || 0
    case 'views':
      return value == null || value === '' ? 0 : Number(value) || 0
    case 'favorite':
      return value === true || value === 1 || value === '1'
    case 'metaId':
      return value == null || value === '' ? null : Number(value) || null
    case 'name':
      return value == null ? '' : String(value)
    case 'synonyms':
    case 'bookmark':
    case 'color':
    case 'country':
    case 'viewedAt':
    case 'oldId':
      return value == null || value === '' ? null : String(value)
    default:
      return value
  }
}

export function pickTagFields(data: Record<string, unknown>): Partial<TagInsert> {
  const picked: Partial<TagInsert> = {}

  for (const [key, value] of Object.entries(data)) {
    if (!TAG_MUTABLE_COLUMNS.has(key) || value === undefined) continue
    ;(picked as Record<string, unknown>)[key] = coerceTagField(key, value)
  }

  return picked
}

const TAG_ITEMS_SELECT = `SELECT tags.*, tags_in_tags.tag_tags, values_in_tags.tag_values
FROM tags`

/** Full-meta hydrate: aggregates every tagsInTags / valuesInTags row. */
const TAG_ITEMS_QUERY = `${TAG_ITEMS_SELECT}
         LEFT JOIN (SELECT tagsInTags.parentTagId                                     id,
                           GROUP_CONCAT(tagsInTags.tagId || '^' || tagsInTags.metaId) tag_tags
                    FROM tagsInTags
                    GROUP BY id) AS tags_in_tags ON tags.id = tags_in_tags.id
         LEFT JOIN (SELECT valuesInTags.tagId                                             id,
                           GROUP_CONCAT(valuesInTags.value || '^' || valuesInTags.metaId) tag_values
                    FROM valuesInTags
                    GROUP BY id) AS values_in_tags ON tags.id = values_in_tags.id
WHERE tags.metaId = ?`

/** Page hydrate: scope GROUP_CONCAT subqueries to the requested tag ids. */
function buildTagItemsQueryForIds(ids: number[]): {sql: string; params: number[]} {
  const placeholders = ids.map(() => '?').join(', ')
  const sql = `${TAG_ITEMS_SELECT}
         LEFT JOIN (SELECT tagsInTags.parentTagId                                     id,
                           GROUP_CONCAT(tagsInTags.tagId || '^' || tagsInTags.metaId) tag_tags
                    FROM tagsInTags
                    WHERE tagsInTags.parentTagId IN (${placeholders})
                    GROUP BY id) AS tags_in_tags ON tags.id = tags_in_tags.id
         LEFT JOIN (SELECT valuesInTags.tagId                                             id,
                           GROUP_CONCAT(valuesInTags.value || '^' || valuesInTags.metaId) tag_values
                    FROM valuesInTags
                    WHERE valuesInTags.tagId IN (${placeholders})
                    GROUP BY id) AS values_in_tags ON tags.id = values_in_tags.id
WHERE tags.metaId = ? AND tags.id IN (${placeholders})`
  // Bind order: tagsInTags IN, valuesInTags IN, metaId, tags.id IN
  return {sql, params: [...ids, ...ids]}
}

export function createTagsRepository(db: DrizzleClient, sqlite: Database.Database) {
  return {
    bulkCreate(items: Array<Partial<TagInsert>>): TagRow[] {
      if (!items.length) return []

      const timestamp = nowIso()
      return mapChunks(items, (chunk) => {
        const values = chunk.map((item) => ({
          oldId: item.oldId == null ? null : String(item.oldId),
          name: item.name ?? '',
          synonyms: item.synonyms ?? null,
          rating: item.rating ?? 0,
          favorite: item.favorite ?? false,
          bookmark: item.bookmark ?? null,
          country: item.country ?? null,
          color: item.color ?? null,
          views: item.views ?? 0,
          viewedAt: item.viewedAt ?? null,
          metaId: item.metaId ?? null,
          createdAt: timestamp,
          updatedAt: timestamp,
        }))

        return db.insert(tags).values(values).returning().all()
      })
    },

    findAllRaw(): TagRow[] {
      return db.select().from(tags).all()
    },

    /** Name-only projection for exclude-existing / lookup sets. */
    findAllNames(): Array<{name: string}> {
      return db.select({name: tags.name}).from(tags).all()
        .map((row) => ({name: String(row.name || '')}))
        .filter((row) => Boolean(row.name))
    },

    /** id/name/synonyms for scene-marker title matching. */
    findAllLookup(): TagLookupRow[] {
      return db.select({
        id: tags.id,
        name: tags.name,
        synonyms: tags.synonyms,
      }).from(tags).all()
    },

    findAllCatalog(): TagCatalogRow[] {
      return db.select({
        id: tags.id,
        metaId: tags.metaId,
        name: tags.name,
        synonyms: tags.synonyms,
        rating: tags.rating,
        favorite: tags.favorite,
        bookmark: tags.bookmark,
        country: tags.country,
        color: tags.color,
        views: tags.views,
      }).from(tags).all()
    },

    findByMetaIds(metaIds: number[]): TagRow[] {
      if (!metaIds.length) return []
      return db.select().from(tags).where(inArray(tags.metaId, metaIds)).all()
    },

    findOldIdMappings(): Array<{id: number; oldId: string | null}> {
      return db.select({id: tags.id, oldId: tags.oldId}).from(tags).all()
    },

    findAllIds(): Array<{id: number}> {
      return db.select({id: tags.id}).from(tags).all()
    },

    findById(id: number): TagRow | undefined {
      return db.select().from(tags).where(eq(tags.id, id)).get()
    },

    countAll(): number {
      const row = db.select({count: count()}).from(tags).get()
      return Number(row?.count ?? 0)
    },

    updateById(id: number, data: Record<string, unknown>, options: {silent?: boolean} = {}): void {
      const payload = pickTagFields(data)
      if (!options.silent) {
        payload.updatedAt = nowIso()
      }

      db.update(tags)
        .set(payload)
        .where(eq(tags.id, id))
        .run()
    },

    updateByIds(ids: number[], data: Record<string, unknown>): void {
      if (!ids.length) return

      db.update(tags)
        .set({
          ...pickTagFields(data),
          updatedAt: nowIso(),
        })
        .where(inArray(tags.id, ids))
        .run()
    },

    deleteById(id: number): void {
      db.delete(tags).where(eq(tags.id, id)).run()
    },

    getItemsForMeta(metaId: number, ids: number[] = []) {
      if (!ids.length) {
        return sqlite.prepare(TAG_ITEMS_QUERY).all(metaId)
      }

      const {sql, params} = buildTagItemsQueryForIds(ids)
      return sqlite.prepare(sql).all(...params, metaId, ...ids)
    },
  }
}
