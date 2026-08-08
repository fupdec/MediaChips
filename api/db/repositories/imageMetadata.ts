import { eq } from 'drizzle-orm'
import type { DrizzleClient } from '../client'
import { imageMetadata } from '../schema/imageMetadata'

export type ImageMetadataRow = typeof imageMetadata.$inferSelect
export type ImageMetadataInsert = typeof imageMetadata.$inferInsert

export function createImageMetadataRepository(db: DrizzleClient) {
  return {
    findByMediaId(mediaId: number): ImageMetadataRow | undefined {
      return db.select().from(imageMetadata).where(eq(imageMetadata.mediaId, mediaId)).get()
    },

    create(data: ImageMetadataInsert): ImageMetadataRow {
      return db.insert(imageMetadata).values(data).returning().get()
    },

    upsert(data: ImageMetadataInsert): void {
      db.insert(imageMetadata)
        .values(data)
        .onConflictDoUpdate({
          target: imageMetadata.mediaId,
          set: data,
        })
        .run()
    },

    updateByMediaId(mediaId: number, data: Partial<ImageMetadataInsert>): void {
      db.update(imageMetadata)
        .set(data)
        .where(eq(imageMetadata.mediaId, mediaId))
        .run()
    },
  }
}
