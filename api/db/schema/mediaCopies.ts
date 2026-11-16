import {sqliteTable, text, integer, index, uniqueIndex} from 'drizzle-orm/sqlite-core'
import {media} from './media'
import type {CopyVerificationMethod} from '../../../shared/copyVerification'
import type {SourceAvailability} from '../../../shared/mediaSources'

/** Comparison fingerprints with an explicit method; existing rows retain their SHA-256 provenance. */
export const verifiedMediaCopies = sqliteTable('verifiedMediaCopies', {
  id: text('id').primaryKey(),
  mediaId: integer('mediaId').notNull().references(() => media.id, {onDelete: 'cascade'}),
  path: text('path').notNull(),
  relationship: text('relationship').$type<'copy' | 'version'>().notNull().default('copy'),
  version: text('version').notNull(),
  sha256: text('sha256').notNull(),
  oshash: text('oshash'),
  verificationMethod: text('verificationMethod').$type<CopyVerificationMethod>().notNull().default('sha256'),
  size: integer('size').notNull(),
  contentType: text('contentType').notNull(),
  availability: text('availability').$type<SourceAvailability>().notNull().default('unknown'),
  verifiedAt: text('verifiedAt').notNull(),
}, t => ({
  pathIdx: uniqueIndex('verified_media_copies_path_idx').on(t.mediaId, t.path),
  lookupPathIdx: index('verified_media_copies_lookup_path_idx').on(t.path),
}))

export const mediaCopyPreferences = sqliteTable('mediaCopyPreferences', {
  mediaId: integer('mediaId').primaryKey().references(() => media.id, {onDelete: 'cascade'}),
  copyId: text('copyId').notNull(),
})
