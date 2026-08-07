import { eq } from 'drizzle-orm'
import type { DrizzleClient } from '../client'
import { textContent } from '../schema/textContent'

export type TextContentRow = typeof textContent.$inferSelect
export type TextContentInsert = typeof textContent.$inferInsert

export function createTextContentRepository(db: DrizzleClient) {
  return {
    create(data: TextContentInsert): TextContentRow {
      return db.insert(textContent).values(data).returning().get()
    },

    upsert(data: TextContentInsert): void {
      db.insert(textContent)
        .values(data)
        .onConflictDoUpdate({
          target: textContent.mediaId,
          set: data,
        })
        .run()
    },

    updateByMediaId(mediaId: number, data: Partial<TextContentInsert>): void {
      db.update(textContent)
        .set(data)
        .where(eq(textContent.mediaId, mediaId))
        .run()
    },

    findByMediaId(mediaId: number): TextContentRow | undefined {
      return db.select().from(textContent).where(eq(textContent.mediaId, mediaId)).get()
    },

    deleteByMediaId(mediaId: number): void {
      db.delete(textContent).where(eq(textContent.mediaId, mediaId)).run()
    },
  }
}
