import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const filterRows = sqliteTable('filterRows', {
  id: integer('id').primaryKey({autoIncrement: true}),
  param: text('param'),
  type: text('type'),
  cond: text('cond'),
  val: text('val'),
  active: integer('active', {mode: 'boolean'}),
  note: text('note'),
  lock: integer('lock', {mode: 'boolean'}),
  union: text('union'),
  metaId: integer('metaId'),
  order: integer('order').default(0),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(),
})
