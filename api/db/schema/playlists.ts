import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const playlists = sqliteTable('playlists', {
  id: integer('id').primaryKey({autoIncrement: true}),
  name: text('name'),
  favorite: integer('favorite', {mode: 'boolean'}).default(false),
  oldId: text('oldId'),
  deletedAt: text('deletedAt'),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(),
})
