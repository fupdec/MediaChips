import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const savedFilters = sqliteTable('savedFilters', {
  id: integer('id').primaryKey({autoIncrement: true}),
  name: text('name'),
  metaId: integer('metaId'),
  mediaTypeId: integer('mediaTypeId'),
  tagId: integer('tagId'),
  tabId: integer('tabId'),
  /** Saved view layout: sort / group / card size / view mode. */
  sortBy: text('sortBy'),
  sortDir: text('sortDir'),
  size: integer('size'),
  view: integer('view'),
  /** Serialized group-by (`none`, `rating`, `pinnedMeta:3`, …). */
  groupBy: text('groupBy'),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(),
})
