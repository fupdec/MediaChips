import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const textContent = sqliteTable('textContent', {
  mediaId: integer('mediaId').primaryKey(),
  content: text('content').default(''),
  excerpt: text('excerpt').default(''),
  truncated: integer('truncated').default(0),
})
