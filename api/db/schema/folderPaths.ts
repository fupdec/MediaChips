import { integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const folderPaths = sqliteTable('folderPaths', {
  id: integer('id').primaryKey({autoIncrement: true}),
  path: text('path').notNull(),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(),
}, (table) => ({
  pathUnique: uniqueIndex('folder_paths_path_unique_idx').on(table.path),
}))

export const tagsInFolders = sqliteTable('tagsInFolders', {
  folderId: integer('folderId').notNull(),
  tagId: integer('tagId').notNull(),
  metaId: integer('metaId').notNull(),
}, (table) => ({
  pk: primaryKey({columns: [table.folderId, table.tagId, table.metaId]}),
}))
