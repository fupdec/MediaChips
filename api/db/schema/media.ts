import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const media = sqliteTable('media', {
  id: integer('id').primaryKey({autoIncrement: true}),
  path: text('path').notNull().unique(),
  basename: text('basename'),
  name: text('name'),
  ext: text('ext'),
  filesize: integer('filesize').default(0),
  contentHash: text('contentHash'),
  oshash: text('oshash'),
  /** Perceptual aHash of the video's 3×3 grid JPEG (16 hex chars). */
  visualHash: text('visualHash'),
  /** Colon-separated per-tile aHashes from the grid (row-major). */
  visualHashTiles: text('visualHashTiles'),
  /** Perceptual aHash of the standalone video thumbnail. */
  visualHashThumbnail: text('visualHashThumbnail'),
  rating: integer('rating').default(0),
  favorite: integer('favorite', {mode: 'boolean'}).default(false),
  bookmark: text('bookmark'),
  views: integer('views').default(0),
  oldId: text('oldId').unique(),
  viewedAt: text('viewedAt'),
  /** Capture / Media Created date (EXIF, container tags, or FS birthtime/mtime fallback). */
  mediaCreatedAt: text('mediaCreatedAt'),
  /** Soft-delete timestamp; null/empty means active in the library. */
  deletedAt: text('deletedAt'),
  /** Original path while the row sits in Trash (path itself is rewritten for uniqueness). */
  trashOriginalPath: text('trashOriginalPath'),
  /** When set, purge should also unlink the original file on disk. */
  trashPurgeFile: integer('trashPurgeFile', {mode: 'boolean'}).default(false),
  mediaTypeId: integer('mediaTypeId'),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(),
}, (table) => ({
  favoriteIdIdx: index('media_favorite_id_idx').on(table.favorite, table.id),
  mediaTypeNameIdx: index('media_media_type_id_name_idx').on(table.mediaTypeId, table.name),
  mediaTypePathIdx: index('media_media_type_id_path_idx').on(table.mediaTypeId, table.path),
  mediaTypeExtIdx: index('media_media_type_id_ext_idx').on(table.mediaTypeId, table.ext),
  mediaTypeMediaCreatedAtIdx: index('media_media_type_id_media_created_at_idx').on(
    table.mediaTypeId,
    table.mediaCreatedAt,
  ),
}))
