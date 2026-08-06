import { and, asc, eq, inArray } from 'drizzle-orm'
import type { DrizzleClient } from '../client'
import { media } from '../schema/media'
import { mediaInPlaylists } from '../schema/mediaInPlaylists'

export type MediaInPlaylistRow = typeof mediaInPlaylists.$inferSelect
export type MediaInPlaylistInsert = typeof mediaInPlaylists.$inferInsert

/** Playback / edit dialog projection — no fingerprint/hash columns. */
const PLAYLIST_MEDIA_COLUMNS = {
  id: media.id,
  path: media.path,
  name: media.name,
  basename: media.basename,
  ext: media.ext,
  mediaTypeId: media.mediaTypeId,
  filesize: media.filesize,
  rating: media.rating,
  favorite: media.favorite,
  views: media.views,
  viewedAt: media.viewedAt,
} as const

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
        ? db.select(PLAYLIST_MEDIA_COLUMNS)
          .from(media)
          .where(inArray(media.id, mediaIds))
          .all()
        : []
      const mediaById = new Map(mediaRows.map((item) => [item.id, item]))

      return links.map((link) => ({
        ...link,
        media: mediaById.get(link.mediaId) ?? null,
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
