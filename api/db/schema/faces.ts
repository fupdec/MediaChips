import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const faces = sqliteTable('faces', {
  id: integer('id').primaryKey({autoIncrement: true}),
  mediaId: integer('mediaId').notNull(),
  timestamp: text('timestamp'),
  score: real('score').notNull().default(0),
  x: real('x').notNull().default(0),
  y: real('y').notNull().default(0),
  width: real('width').notNull().default(0),
  height: real('height').notNull().default(0),
  cropPath: text('cropPath'),
  embedding: text('embedding'),
  tagId: integer('tagId'),
  matchScore: real('matchScore'),
  matchStatus: text('matchStatus'),
  createdAt: text('createdAt').notNull(),
})
