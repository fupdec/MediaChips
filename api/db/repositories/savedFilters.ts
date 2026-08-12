import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm'
import type { DrizzleClient } from '../client'
import { savedFilters } from '../schema/savedFilters'
import { nowIso } from '../utils/timestamps'

export type SavedFilterRow = typeof savedFilters.$inferSelect
export type SavedFilterInsert = typeof savedFilters.$inferInsert

const SAVED_FILTER_MUTABLE_COLUMNS = new Set([
  'name', 'metaId', 'mediaTypeId', 'tagId', 'tabId',
  'sortBy', 'sortDir', 'size', 'view', 'groupBy',
])

function pickSavedFilterFields(data: Record<string, unknown>): Partial<SavedFilterInsert> {
  const picked: Partial<SavedFilterInsert> = {}
  for (const [key, value] of Object.entries(data)) {
    if (SAVED_FILTER_MUTABLE_COLUMNS.has(key)) {
      (picked as Record<string, unknown>)[key] = value
    }
  }
  return picked
}

function nullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function nullableText(value: unknown): string | null {
  if (value == null) return null
  const text = String(value)
  return text.length ? text : null
}

export function createSavedFiltersRepository(db: DrizzleClient) {
  return {
    create(data: Partial<SavedFilterInsert>): SavedFilterRow {
      const timestamp = nowIso()
      return db.insert(savedFilters)
        .values({
          name: data.name ?? null,
          metaId: data.metaId == null ? null : Number(data.metaId),
          mediaTypeId: data.mediaTypeId == null ? null : Number(data.mediaTypeId),
          tagId: data.tagId == null ? null : Number(data.tagId),
          tabId: data.tabId == null ? null : Number(data.tabId),
          sortBy: nullableText(data.sortBy),
          sortDir: nullableText(data.sortDir),
          size: nullableNumber(data.size),
          view: nullableNumber(data.view),
          groupBy: nullableText(data.groupBy),
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .returning()
        .get()
    },

    findOrCreate(payload: {
      name?: string | null
      mediaTypeId?: number | null
      metaId?: number | null
      tagId?: number | null
      tabId?: number | null
    }): {row: SavedFilterRow; created: boolean} {
      const existing = db.select()
        .from(savedFilters)
        .where(and(
          payload.name == null ? isNull(savedFilters.name) : eq(savedFilters.name, payload.name),
          payload.mediaTypeId == null ? isNull(savedFilters.mediaTypeId) : eq(savedFilters.mediaTypeId, payload.mediaTypeId),
          payload.metaId == null ? isNull(savedFilters.metaId) : eq(savedFilters.metaId, payload.metaId),
          payload.tagId == null ? isNull(savedFilters.tagId) : eq(savedFilters.tagId, payload.tagId),
          payload.tabId == null ? isNull(savedFilters.tabId) : eq(savedFilters.tabId, payload.tabId),
        ))
        .get()

      if (existing) {
        return {row: existing, created: false}
      }

      return {row: this.create(payload), created: true}
    },

    findById(id: number): SavedFilterRow | undefined {
      return db.select().from(savedFilters).where(eq(savedFilters.id, id)).get()
    },

    findAllNamed(filters: Record<string, unknown> = {}): SavedFilterRow[] {
      return db.select()
        .from(savedFilters)
        .where(isNotNull(savedFilters.name))
        .all()
        .filter((row) => {
          for (const [key, value] of Object.entries(filters)) {
            if (!SAVED_FILTER_MUTABLE_COLUMNS.has(key)) continue
            if ((row as Record<string, unknown>)[key] != value) return false
          }
          return true
        })
    },

    findDynamicPlaylists(mediaTypeId: number): Array<{id: number; name: string | null}> {
      return db.select({
        id: savedFilters.id,
        name: savedFilters.name,
      })
        .from(savedFilters)
        .where(and(
          isNotNull(savedFilters.name),
          eq(savedFilters.mediaTypeId, mediaTypeId),
        ))
        .orderBy(asc(savedFilters.name))
        .all()
    },

    findDynamicPlaylistsFull(mediaTypeId: number): SavedFilterRow[] {
      return db.select()
        .from(savedFilters)
        .where(and(
          isNotNull(savedFilters.name),
          eq(savedFilters.mediaTypeId, mediaTypeId),
        ))
        .orderBy(asc(savedFilters.name))
        .all()
    },

    updateById(id: number, data: Record<string, unknown>): void {
      db.update(savedFilters)
        .set({
          ...pickSavedFilterFields(data),
          updatedAt: nowIso(),
        })
        .where(eq(savedFilters.id, id))
        .run()
    },

    deleteById(id: number): void {
      db.delete(savedFilters).where(eq(savedFilters.id, id)).run()
    },
  }
}
