import {blob, integer, sqliteTable, text} from 'drizzle-orm/sqlite-core'

export const mediaClipEmbeddings = sqliteTable('mediaClipEmbeddings', {
  mediaId: integer('mediaId').primaryKey(),
  embedding: blob('embedding', {mode: 'buffer'}).notNull(),
  dims: integer('dims').notNull(),
  model: text('model').notNull(),
  updatedAt: text('updatedAt').notNull(),
})
