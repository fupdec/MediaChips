import { eq } from 'drizzle-orm'
import type { DrizzleClient } from '../client'
import { mediaTypes } from '../schema/mediaTypes'
import { nowIso } from '../utils/timestamps'

export type MediaTypeRow = typeof mediaTypes.$inferSelect
export type MediaTypeInsert = typeof mediaTypes.$inferInsert

export function createMediaTypesRepository(db: DrizzleClient) {
  return {
    create(data: Partial<MediaTypeInsert>): MediaTypeRow {
      const timestamp = nowIso()
      return db.insert(mediaTypes)
        .values({
          name: data.name ?? null,
          icon: data.icon ?? null,
          extensions: data.extensions ?? null,
          order: data.order ?? null,
          hidden: data.hidden ?? false,
          custom: data.custom ?? true,
          type: data.type ?? null,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .returning()
        .get()
    },

    findAll(): MediaTypeRow[] {
      return db.select().from(mediaTypes).all()
    },

    findById(id: number): MediaTypeRow | undefined {
      return db.select().from(mediaTypes).where(eq(mediaTypes.id, id)).get()
    },

    findByType(type: string): MediaTypeRow | undefined {
      return db.select().from(mediaTypes).where(eq(mediaTypes.type, type)).get()
    },

    updateById(id: number, data: Partial<MediaTypeInsert>): void {
      db.update(mediaTypes)
        .set({
          ...data,
          updatedAt: nowIso(),
        })
        .where(eq(mediaTypes.id, id))
        .run()
    },

    deleteById(id: number): void {
      db.delete(mediaTypes).where(eq(mediaTypes.id, id)).run()
    },
  }
}
