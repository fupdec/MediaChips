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
  rating: integer('rating').default(0),
  favorite: integer('favorite', {mode: 'boolean'}).default(false),
  bookmark: text('bookmark'),
  views: integer('views').default(0),
  oldId: text('oldId').unique(),
  viewedAt: text('viewedAt'),
  mediaTypeId: integer('mediaTypeId'),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(),
}, (table) => ({
  favoriteIdIdx: index('media_favorite_id_idx').on(table.favorite, table.id),
}))
