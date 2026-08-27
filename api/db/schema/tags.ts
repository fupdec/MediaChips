import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({autoIncrement: true}),
  oldId: text('oldId').unique(),
  name: text('name').notNull(),
  synonyms: text('synonyms'),
  rating: integer('rating').default(0).notNull(),
  favorite: integer('favorite', {mode: 'boolean'}).default(false).notNull(),
  bookmark: text('bookmark'),
  country: text('country'),
  color: text('color'),
  views: integer('views').default(0),
  viewedAt: text('viewedAt'),
  metaId: integer('metaId'),
  deletedAt: text('deletedAt'),
  trashOriginalName: text('trashOriginalName'),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(),
}, () => ({
  nameNormalizedUnique: uniqueIndex('tags_name_normalized_unique')
    .on(sql`lower(trim("name"))`)
    .where(sql`"deletedAt" IS NULL OR "deletedAt" = ''`),
}))
