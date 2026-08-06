import { and, asc, eq, inArray } from 'drizzle-orm'
import type { DrizzleClient } from '../client'
import { media } from '../schema/media'
import { mediaInPlaylists } from '../schema/mediaInPlaylists'
import { playlists } from '../schema/playlists'

export type MediaInPlaylistRow = typeof mediaInPlaylists.$inferSelect
export type MediaInPlaylistInsert = typeof mediaInPlaylists.$inferInsert

export function createMediaInPlaylistsRepository(db: DrizzleClient) {
  return {
    findByPlaylistId(playlistId: number) {
      const links = db.select()
        .from(mediaInPlaylists)
        .where(eq(mediaInPlaylists.playlistId, playlistId))
        .orderBy(asc(mediaInPlaylists.order))
        .all()

      const mediaIds = [...new Set(links.map((link) => link.mediaId))]
      const mediaRows = mediaIds.length
        ? db.select().from(media).where(inArray(media.id, mediaIds)).all()
        : []
      const playlist = db.select().from(playlists).where(eq(playlists.id, playlistId)).get()
      const mediaById = new Map(mediaRows.map((item) => [item.id, item]))

      return links.map((link) => ({
        ...link,
        media: mediaById.get(link.mediaId) ?? null,
        playlist: playlist ?? null,
      }))
    },

    findAllGroupedByPlaylist() {
      const links = db.select().from(mediaInPlaylists).all()
      const grouped = new Map<number, MediaInPlaylistRow[]>()

      for (const link of links) {
        const list = grouped.get(link.playlistId) ?? []
        list.push(link)
        grouped.set(link.playlistId, list)
      }

      return grouped
    },

    create(payload: MediaInPlaylistInsert): void {
      db.insert(mediaInPlaylists)
        .values({
          mediaId: payload.mediaId,
          playlistId: payload.playlistId,
          order: payload.order ?? null,
        })
        .run()
    },

    findOrCreate(payload: MediaInPlaylistInsert): {row: MediaInPlaylistRow; created: boolean} {
      const existing = db.select()
        .from(mediaInPlaylists)
        .where(and(
          eq(mediaInPlaylists.mediaId, payload.mediaId),
          eq(mediaInPlaylists.playlistId, payload.playlistId),
        ))
        .get()

      if (existing) {
        return {row: existing, created: false}
      }

      const row = db.insert(mediaInPlaylists)
        .values({
          mediaId: payload.mediaId,
          playlistId: payload.playlistId,
          order: payload.order ?? null,
        })
        .returning()
        .get()

      return {row, created: true}
    },

    updateByKeys(
      mediaId: number,
      playlistId: number,
      data: Partial<MediaInPlaylistInsert>,
    ): void {
      db.update(mediaInPlaylists)
        .set(data)
        .where(and(
          eq(mediaInPlaylists.mediaId, mediaId),
          eq(mediaInPlaylists.playlistId, playlistId),
        ))
        .run()
    },

    deleteByKeys(mediaId: number, playlistId: number): void {
      db.delete(mediaInPlaylists)
        .where(and(
          eq(mediaInPlaylists.mediaId, mediaId),
          eq(mediaInPlaylists.playlistId, playlistId),
        ))
        .run()
    },
  }
}
