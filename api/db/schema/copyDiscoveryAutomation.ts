import {sqliteTable, text, integer, index} from 'drizzle-orm/sqlite-core'
export const copyDiscoveryAutoRoots = sqliteTable('copyDiscoveryAutoRoots', {
  id: text('id').primaryKey(), connectionId: text('connectionId'), key: text('key').notNull(),
  excluded: text('excluded').notNull().default('[]'), origin: text('origin').notNull(), monitor: integer('monitor').notNull().default(1),
  available: integer('available'), identity: text('identity'), observedAt: integer('observedAt'),
})
export const copyDiscoveryAutoRequests = sqliteTable('copyDiscoveryAutoRequests', {
  rootId: text('rootId').primaryKey().references(() => copyDiscoveryAutoRoots.id, {onDelete: 'cascade'}),
  reasons: text('reasons').notNull(), generation: integer('generation').notNull().default(1), firstAt: integer('firstAt').notNull(),
  dueAt: integer('dueAt').notNull(), expanded: integer('expanded').notNull().default(0), jobId: text('jobId'), submittedGeneration: integer('submittedGeneration'),
}, t => ({dueIdx: index('copy_discovery_auto_due_idx').on(t.jobId, t.dueAt)}))
