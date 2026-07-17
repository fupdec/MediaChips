import { eq } from 'drizzle-orm'
import type { DrizzleClient } from '../client'
import { videoMetadata } from '../schema/videoMetadata'
import { forEachChunk } from '../utils/chunk'

export type VideoMetadataRow = typeof videoMetadata.$inferSelect
export type VideoMetadataInsert = typeof videoMetadata.$inferInsert

export function createVideoMetadataRepository(db: DrizzleClient) {
  return {
    findByMediaId(mediaId: number): VideoMetadataRow | undefined {
      return db.select().from(videoMetadata).where(eq(videoMetadata.mediaId, mediaId)).get()
    },

    create(data: VideoMetadataInsert): VideoMetadataRow {
      return db.insert(videoMetadata).values(data).returning().get()
    },

    bulkCreate(items: VideoMetadataInsert[]): void {
      if (!items.length) return
      forEachChunk(items, (chunk) => {
        db.insert(videoMetadata).values(chunk).run()
      })
    },

    updateByMediaId(mediaId: number, data: Partial<VideoMetadataInsert>): void {
      const existing = this.findByMediaId(mediaId)
      if (!existing) {
        db.insert(videoMetadata)
          .values({mediaId, ...data})
          .run()
        return
      }
      db.update(videoMetadata)
        .set(data)
        .where(eq(videoMetadata.mediaId, mediaId))
        .run()
    },

    upsert(data: VideoMetadataInsert): void {
      db.insert(videoMetadata)
        .values(data)
        .onConflictDoUpdate({
          target: videoMetadata.mediaId,
          set: data,
        })
        .run()
    },
  }
}
