import {index, integer, sqliteTable, text} from 'drizzle-orm/sqlite-core'

export const changeHistory = sqliteTable('changeHistory', {
  id: integer('id').primaryKey({autoIncrement: true}),
  operationId: text('operationId').notNull(),
  source: text('source').notNull(),
  occurredAt: text('occurredAt').notNull(),
  entityType: text('entityType').notNull(),
  entityId: integer('entityId').notNull(),
  field: text('field').notNull(),
  beforeValue: text('beforeValue').notNull(),
  afterValue: text('afterValue').notNull(),
  restoredAt: text('restoredAt'),
}, table => ({
  operation: index('change_history_operation_idx').on(table.operationId, table.id),
  entity: index('change_history_entity_idx').on(table.entityType, table.entityId, table.id),
}))
