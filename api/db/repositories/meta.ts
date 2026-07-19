import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import type { DrizzleClient } from '../client'
import { meta } from '../schema/meta'
import { metaSettings } from '../schema/metaSettings'
import { pageSettings } from '../schema/pageSettings'
import { savedFilters } from '../schema/savedFilters'
import { nowIso } from '../utils/timestamps'

export type MetaRow = typeof meta.$inferSelect
export type MetaInsert = typeof meta.$inferInsert

const META_COLUMNS = new Set([
  'type', 'name', 'icon', 'hint', 'order', 'views', 'oldId',
  'synonyms', 'hidden', 'nested', 'marks', 'bookmark', 'parser', 'country', 'career',
  'scraper', 'rating', 'favorite', 'chipVariant', 'chipLabel', 'color', 'autoColorFromImage',
  'imageAspectRatio', 'tagPageDesign', 'measurementUnit', 'isLink', 'ratingIcon', 'ratingIconEmpty', 'ratingIconHalf',
  'ratingMax', 'ratingColor', 'ratingHalf', 'sortBy', 'sortDir',
])

const META_SETTING_COLUMNS = new Set([
  'synonyms', 'hidden', 'nested', 'marks', 'bookmark', 'parser', 'country', 'career',
  'scraper', 'rating', 'favorite', 'chipOutlined', 'chipLabel', 'color',
  'imageAspectRatio', 'isLink', 'ratingIcon', 'ratingIconEmpty', 'ratingIconHalf',
  'ratingMax', 'ratingColor', 'ratingHalf', 'sortBy', 'sortDir',
])

function pickMetaFields(data: Record<string, unknown>): Partial<MetaInsert> {
  const picked: Partial<MetaInsert> = {}
  for (const [key, value] of Object.entries(data)) {
    if (META_COLUMNS.has(key)) {
      (picked as Record<string, unknown>)[key] = key === 'oldId' && value != null
        ? String(value)
        : value
    }
  }
  return picked
}

function pickMetaSettingFields(data: Record<string, unknown>): Partial<typeof metaSettings.$inferInsert> {
  const picked: Partial<typeof metaSettings.$inferInsert> = {}
  for (const [key, value] of Object.entries(data)) {
    if (META_SETTING_COLUMNS.has(key)) {
      (picked as Record<string, unknown>)[key] = value
    }
  }
  return picked
}

export function createMetaRepository(db: DrizzleClient) {
  return {
    findAll(): MetaRow[] {
      return db.select().from(meta).all()
    },

    findById(id: number): MetaRow | undefined {
      return db.select().from(meta).where(eq(meta.id, id)).get()
    },

    findLatest(limit = 1): MetaRow[] {
      return db.select().from(meta).orderBy(desc(meta.createdAt)).limit(limit).all()
    },

    findMarkFilters(): MetaRow[] {
      return db.select()
        .from(meta)
        .where(eq(meta.marks, true))
        .orderBy(asc(meta.order), asc(meta.name))
        .all()
    },

    findOldIdMappings(): Array<{id: number; oldId: string | null; type: string | null}> {
      return db.select({
        id: meta.id,
        oldId: meta.oldId,
        type: meta.type,
      }).from(meta).all()
    },

    create(body: Record<string, unknown>): MetaRow {
      const {pageSetting, pageSettings: pageSettingsList, metaSetting, ...rest} = body

      const timestamp = nowIso()
      const row = db.insert(meta)
        .values({
          ...pickMetaFields(rest),
          createdAt: (rest.createdAt as string | undefined) ?? timestamp,
          updatedAt: (rest.updatedAt as string | undefined) ?? timestamp,
        })
        .returning()
        .get()

      if (metaSetting && typeof metaSetting === 'object') {
        db.insert(metaSettings)
          .values({
            metaId: row.id,
            ...pickMetaSettingFields(metaSetting as Record<string, unknown>),
          })
          .run()
      }

      const nestedPageSetting = pageSetting ?? (Array.isArray(pageSettingsList) ? pageSettingsList[0] : null)
      if (nestedPageSetting && typeof nestedPageSetting === 'object') {
        db.insert(pageSettings)
          .values({
            ...(nestedPageSetting as Record<string, unknown>),
            metaId: row.id,
          } as typeof pageSettings.$inferInsert)
          .run()
      }

      return row
    },

    updateById(id: number, body: Record<string, unknown>): void {
      db.update(meta)
        .set({
          ...pickMetaFields(body),
          updatedAt: nowIso(),
        })
        .where(eq(meta.id, id))
        .run()
    },

    deleteById(id: number): void {
      db.delete(meta).where(eq(meta.id, id)).run()
    },

    ensureArrayMetaResources(metaId: number): {filterId: number; created: boolean} {
      const existing = db.select()
        .from(savedFilters)
        .where(and(eq(savedFilters.metaId, metaId), isNull(savedFilters.name)))
        .get()

      if (existing) {
        return {filterId: existing.id, created: false}
      }

      const timestamp = nowIso()
      const filter = db.insert(savedFilters)
        .values({
          name: null,
          metaId,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .returning()
        .get()

      db.update(pageSettings)
        .set({filterId: filter.id})
        .where(eq(pageSettings.metaId, metaId))
        .run()

      return {filterId: filter.id, created: true}
    },
  }
}
