import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const marks = sqliteTable('marks', {
  id: integer('id').primaryKey({autoIncrement: true}),
  type: text('type'),
  text: text('text'),
  time: integer('time'),
  end: integer('end'),
  tagId: integer('tagId'),
  mediaId: integer('mediaId'),
  icon: text('icon'),
})
