import { index, integer, primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'

export const tagsInMedia = sqliteTable('tagsInMedia', {
  mediaId: integer('mediaId').notNull(),
  tagId: integer('tagId').notNull(),
  metaId: integer('metaId').notNull(),
}, (table) => ({
  pk: primaryKey({columns: [table.mediaId, table.tagId, table.metaId]}),
  metaMediaIdx: index('tags_in_media_meta_media_idx').on(table.metaId, table.mediaId),
}))
