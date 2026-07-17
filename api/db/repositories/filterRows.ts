import { asc, eq, inArray } from 'drizzle-orm'
import type { DrizzleClient } from '../client'
import { filterRows } from '../schema/filterRows'
import { nowIso } from '../utils/timestamps'

export type FilterRowRecord = typeof filterRows.$inferSelect
export type FilterRowInsert = typeof filterRows.$inferInsert

const FILTER_ROW_MUTABLE_COLUMNS = new Set([
  'param', 'type', 'cond', 'val', 'active', 'note', 'lock', 'union', 'metaId', 'order',
])

function pickFilterRowFields(data: Record<string, unknown>): Partial<FilterRowInsert> {
  const picked: Partial<FilterRowInsert> = {}
  for (const [key, value] of Object.entries(data)) {
    if (FILTER_ROW_MUTABLE_COLUMNS.has(key)) {
      (picked as Record<string, unknown>)[key] = value
    }
  }
  return picked
}

export function createFilterRowsRepository(db: DrizzleClient) {
  return {
    findById(id: number): FilterRowRecord | undefined {
      return db.select().from(filterRows).where(eq(filterRows.id, id)).get()
    },

    findByIds(ids: number[]): FilterRowRecord[] {
      if (!ids.length) return []
      return db.select()
        .from(filterRows)
        .where(inArray(filterRows.id, ids))
        .orderBy(asc(filterRows.order), asc(filterRows.id))
        .all()
    },

    create(data: Record<string, unknown>): FilterRowRecord {
      const timestamp = nowIso()
      return db.insert(filterRows)
        .values({
          ...pickFilterRowFields(data),
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .returning()
        .get()
    },

    updateById(id: number, data: Record<string, unknown>): FilterRowRecord {
      const timestamp = nowIso()
      db.update(filterRows)
        .set({
          ...pickFilterRowFields(data),
          updatedAt: timestamp,
        })
        .where(eq(filterRows.id, id))
        .run()

      return this.findById(id)!
    },

    deleteById(id: number): void {
      db.delete(filterRows).where(eq(filterRows.id, id)).run()
    },
  }
}
