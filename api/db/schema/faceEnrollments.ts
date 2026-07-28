import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const faceEnrollments = sqliteTable('faceEnrollments', {
  id: integer('id').primaryKey({autoIncrement: true}),
  tagId: integer('tagId').notNull(),
  metaId: integer('metaId').notNull(),
  source: text('source').notNull(),
  sourcePath: text('sourcePath'),
  embedding: text('embedding').notNull(),
  createdAt: text('createdAt').notNull(),
})
