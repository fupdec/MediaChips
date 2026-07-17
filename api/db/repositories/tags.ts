import { count, eq, inArray } from 'drizzle-orm'
import type Database from 'better-sqlite3'
import type { DrizzleClient } from '../client'
import { tags } from '../schema/tags'
import { nowIso } from '../utils/timestamps'
import { mapChunks } from '../utils/chunk'

export type TagRow = typeof tags.$inferSelect
export type TagInsert = typeof tags.$inferInsert

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

const TAG_ITEMS_QUERY = `SELECT tags.*, tags_in_tags.tag_tags, values_in_tags.tag_values
FROM tags
         LEFT JOIN (SELECT tagsInTags.parentTagId                                     id,
                           GROUP_CONCAT(tagsInTags.tagId || '^' || tagsInTags.metaId) tag_tags
                    FROM tagsInTags
                    GROUP BY id) AS tags_in_tags ON tags.id = tags_in_tags.id
         LEFT JOIN (SELECT valuesInTags.tagId                                             id,
                           GROUP_CONCAT(valuesInTags.value || '^' || valuesInTags.metaId) tag_values
                    FROM valuesInTags
                    GROUP BY id) AS values_in_tags ON tags.id = values_in_tags.id
WHERE tags.metaId = ?`

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

    findByMetaIds(metaIds: number[]): TagRow[] {
      if (!metaIds.length) return []
      return db.select().from(tags).where(inArray(tags.metaId, metaIds)).all()
    },

    findOldIdMappings(): Array<{id: number; oldId: string | null}> {
      return db.select({id: tags.id, oldId: tags.oldId}).from(tags).all()
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

      const placeholders = ids.map(() => '?').join(', ')
      return sqlite.prepare(`${TAG_ITEMS_QUERY} AND tags.id IN (${placeholders})`).all(metaId, ...ids)
    },
  }
}
