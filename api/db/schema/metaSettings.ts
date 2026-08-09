import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

const boolean = (name: string, defaultValue = false) =>
  integer(name, {mode: 'boolean'}).default(defaultValue)

export const metaSettings = sqliteTable('metaSettings', {
  metaId: integer('metaId').primaryKey(),
  synonyms: boolean('synonyms', false),
  hidden: boolean('hidden', false),
  nested: boolean('nested', false),
  marks: boolean('marks', false),
  bookmark: boolean('bookmark', false),
  parser: boolean('parser', true),
  country: boolean('country', false),
  career: boolean('career', false),
  scraper: boolean('scraper', false),
  rating: boolean('rating', false),
  favorite: boolean('favorite', true),
  chipOutlined: boolean('chipOutlined', false),
  chipLabel: boolean('chipLabel', false),
  color: boolean('color', false),
  imageAspectRatio: real('imageAspectRatio').default(1),
  isLink: boolean('isLink', false),
  ratingIcon: text('ratingIcon').default('star'),
  ratingIconEmpty: text('ratingIconEmpty').default('star-outline'),
  ratingIconHalf: text('ratingIconHalf').default('star-half-full'),
  ratingMax: integer('ratingMax').default(5),
  ratingColor: text('ratingColor').default('#ffab00'),
  ratingHalf: boolean('ratingHalf', false),
  sortBy: text('sortBy').default('createdAt'),
  sortDir: text('sortDir').default('asc'),
})
