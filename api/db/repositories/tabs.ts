import { eq, sql } from 'drizzle-orm'
import type { DrizzleClient } from '../client'
import { tabs } from '../schema/tabs'
import { nowIso } from '../utils/timestamps'

export type TabRow = typeof tabs.$inferSelect
export type TabInsert = typeof tabs.$inferInsert

export function createTabsRepository(db: DrizzleClient) {
  return {
    create(data: Partial<TabInsert>): TabRow {
      const timestamp = nowIso()
      let order = data.order

      if (order === undefined) {
        const maxOrder = db
          .select({value: sql<number | null>`max(${tabs.order})`})
          .from(tabs)
          .get()?.value
        order = (maxOrder ?? -1) + 1
      }

      const result = db.insert(tabs)
        .values({
          name: data.name ?? null,
          icon: data.icon ?? null,
          url: data.url ?? null,
          order,
          metaId: data.metaId ?? null,
          mediaTypeId: data.mediaTypeId ?? null,
          tagId: data.tagId ?? null,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .returning()
        .get()

      return result
    },

    findAll(): TabRow[] {
      return db.select().from(tabs).all()
    },

    updateById(id: number, data: Partial<TabInsert>): void {
      db.update(tabs)
        .set({
          ...data,
          updatedAt: nowIso(),
        })
        .where(eq(tabs.id, id))
        .run()
    },

    deleteById(id: number): void {
      db.delete(tabs).where(eq(tabs.id, id)).run()
    },
  }
}
