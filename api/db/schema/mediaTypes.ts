import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const mediaTypes = sqliteTable('mediaTypes', {
  id: integer('id').primaryKey({autoIncrement: true}),
  name: text('name'),
  icon: text('icon'),
  extensions: text('extensions'),
  order: integer('order'),
  hidden: integer('hidden', {mode: 'boolean'}).default(false),
  custom: integer('custom', {mode: 'boolean'}).default(true),
  type: text('type'),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(),
})
