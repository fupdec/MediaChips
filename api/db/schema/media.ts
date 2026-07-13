import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const media = sqliteTable('media', {
  id: integer('id').primaryKey({autoIncrement: true}),
  path: text('path').notNull().unique(),
  basename: text('basename'),
  name: text('name'),
  ext: text('ext'),
  filesize: integer('filesize').default(0),
  contentHash: text('contentHash'),
  oshash: text('oshash'),
  rating: integer('rating').default(0),
  favorite: integer('favorite', {mode: 'boolean'}).default(false),
  bookmark: text('bookmark'),
  views: integer('views').default(0),
  oldId: text('oldId').unique(),
  viewedAt: text('viewedAt'),
  mediaTypeId: integer('mediaTypeId'),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(),
})
