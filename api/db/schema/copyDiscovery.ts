import {sqliteTable, text, integer, uniqueIndex, index, primaryKey} from 'drizzle-orm/sqlite-core'
import type {CopyDiscoveryState, CopyDiscoveryItemState} from '../../../shared/copyDiscovery'
import type {CopyVerificationMethod} from '../../../shared/copyVerification'

export const copyDiscoveryJobs = sqliteTable('copyDiscoveryJobs', {
  triggers: text('triggers').notNull().default('[]'),
  id: text('id').primaryKey(), state: text('state').$type<CopyDiscoveryState>().notNull(),
  method: text('method').$type<CopyVerificationMethod>().notNull(), roots: text('roots').notNull(), mediaId: integer('mediaId'),
  listingComplete: integer('listingComplete').notNull().default(0), createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(), error: text('error'),
})
export const copyDiscoveryItems = sqliteTable('copyDiscoveryItems', {
  id: text('id').primaryKey(), jobId: text('jobId').notNull().references(() => copyDiscoveryJobs.id, {onDelete: 'cascade'}),
  path: text('path').notNull(), name: text('name').notNull(), size: integer('size').notNull(), version: text('version').notNull(),
  state: text('state').$type<CopyDiscoveryItemState>().notNull().default('candidate'), candidateIds: text('candidateIds').notNull().default('[]'),
  mediaId: integer('mediaId'), copyId: text('copyId'), error: text('error'),
}, t => ({pathIdx: uniqueIndex('copy_discovery_item_path_idx').on(t.jobId, t.path), pendingIdx: index('copy_discovery_pending_idx').on(t.jobId, t.state)}))
export const copyDiscoveryIgnored = sqliteTable('copyDiscoveryIgnored', {
  path: text('path').notNull(), version: text('version').notNull(), mediaId: integer('mediaId').notNull(),
}, t => ({pk: primaryKey({columns: [t.path, t.version, t.mediaId]})}))
