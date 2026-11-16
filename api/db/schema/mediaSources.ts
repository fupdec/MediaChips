import {sqliteTable, text, integer, uniqueIndex, index} from 'drizzle-orm/sqlite-core'
import {media} from './media'
import type {SourceProvider, SourceAvailability} from '../../../shared/mediaSources'

export const sourceConnections = sqliteTable('sourceConnections', {
  id: text('id').primaryKey(),
  provider: text('provider').$type<SourceProvider>().notNull().default('nas'),
  config: text('config').notNull(),
  credentialRef: text('credentialRef').notNull(),
  createdAt: text('createdAt').notNull(),
})
export const mediaLocations = sqliteTable('mediaLocations', {
  id: text('id').primaryKey(),
  mediaId: integer('mediaId').notNull().references(() => media.id, {onDelete: 'cascade'}),
  connectionId: text('connectionId').notNull().references(() => sourceConnections.id),
  resourceKey: text('resourceKey').notNull(),
  version: text('version').notNull(),
  availability: text('availability').$type<SourceAvailability>().notNull().default('unknown'),
  lastVerifiedAt: text('lastVerifiedAt'),
}, t => ({
  resourceIdx: uniqueIndex('media_locations_resource_idx').on(t.connectionId, t.resourceKey, t.version),
  mediaIdx: index('media_locations_media_idx').on(t.mediaId),
}))

/** A root owns its last complete inventory; partial walks never reach this table. */
export const sourceCatalogRoots = sqliteTable('sourceCatalogRoots', {
  id: text('id').primaryKey(),
  name: text('name').notNull().default(''),
  connectionId: text('connectionId').notNull().references(() => sourceConnections.id),
  rootKey: text('rootKey').notNull(),
  intervalMinutes: integer('intervalMinutes').notNull().default(0),
  nextRunAt: integer('nextRunAt'),
  lastCompletedAt: text('lastCompletedAt'),
  lastResult: text('lastResult'),
  lastError: text('lastError'),
}, t => ({rootIdx: uniqueIndex('source_catalog_root_idx').on(t.connectionId, t.rootKey)}))
export const sourceCatalogEntries = sqliteTable('sourceCatalogEntries', {
  rootId: text('rootId').notNull().references(() => sourceCatalogRoots.id, {onDelete: 'cascade'}),
  resourceKey: text('resourceKey').notNull(),
  version: text('version').notNull(),
  name: text('name').notNull(),
}, t => ({entryIdx: uniqueIndex('source_catalog_entry_idx').on(t.rootId, t.resourceKey)}))
export const offlineCopies = sqliteTable('offlineCopies', {
  locationId: text('locationId').primaryKey().references(() => mediaLocations.id, {onDelete: 'cascade'}),
  version: text('version').notNull(),
  size: integer('size').notNull(),
  fileName: text('fileName').notNull(),
  invalidated: integer('invalidated', {mode: 'boolean'}).notNull().default(false),
  contentType: text('contentType').notNull(),
})
export const sourceCacheSettings = sqliteTable('sourceCacheSettings', {
  id: integer('id').primaryKey(),
  limitBytes: integer('limitBytes').notNull().default(5368709120),
})

/** Durable checkpoints; contains paths and progress, never connection secrets. */
export const originalOperationJobs = sqliteTable('originalOperationJobs', {
  id: text('id').primaryKey(),
  payload: text('payload').notNull(),
})
