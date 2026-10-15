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
