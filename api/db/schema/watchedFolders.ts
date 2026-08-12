import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const watchedFolders = sqliteTable('watchedFolders', {
  id: integer('id').primaryKey({autoIncrement: true}),
  path: text('path'),
  name: text('name'),
  watch: integer('watch', {mode: 'boolean'}).default(true),
  icon: text('icon'),
  /** JSON array of absolute paths excluded from watching (must be inside `path`). */
  excludedPaths: text('excludedPaths'),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(),
})

export const mediaTypesInWatchedFolders = sqliteTable('mediaTypesInWatchedFolders', {
  folderId: integer('folderId').notNull(),
  mediaTypeId: integer('mediaTypeId').notNull(),
}, (table) => ({
  pk: primaryKey({columns: [table.folderId, table.mediaTypeId]}),
}))
