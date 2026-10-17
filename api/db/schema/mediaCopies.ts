import {sqliteTable, text, integer, uniqueIndex} from 'drizzle-orm/sqlite-core'
import {media} from './media'
import type {SourceAvailability} from '../../../shared/mediaSources'

/** Full byte hashes, independent of the catalog's sampled fingerprints and provider validators. */
export const verifiedMediaCopies = sqliteTable('verifiedMediaCopies', {
  id: text('id').primaryKey(),
  mediaId: integer('mediaId').notNull().references(() => media.id, {onDelete: 'cascade'}),
  path: text('path').notNull(),
  version: text('version').notNull(),
  sha256: text('sha256').notNull(),
  size: integer('size').notNull(),
  contentType: text('contentType').notNull(),
  availability: text('availability').$type<SourceAvailability>().notNull().default('unknown'),
  verifiedAt: text('verifiedAt').notNull(),
}, t => ({pathIdx: uniqueIndex('verified_media_copies_path_idx').on(t.mediaId, t.path)}))

export const mediaCopyPreferences = sqliteTable('mediaCopyPreferences', {
  mediaId: integer('mediaId').primaryKey().references(() => media.id, {onDelete: 'cascade'}),
  copyId: text('copyId').notNull(),
})
