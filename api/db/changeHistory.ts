import {AsyncLocalStorage} from 'node:async_hooks'
import {randomUUID} from 'node:crypto'
import type Database from 'better-sqlite3'

type ChangeOperation = {id: string; source: string}
const operations = new AsyncLocalStorage<ChangeOperation>()

export function withChangeOperation<T>(source: string, action: () => T): T {
  if (operations.getStore()) return action()
  return operations.run({id: randomUUID(), source}, action)
}

export const HISTORY_TABLE_SQL = `CREATE TABLE IF NOT EXISTS changeHistory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operationId TEXT NOT NULL,
  source TEXT NOT NULL,
  occurredAt TEXT NOT NULL,
  entityType TEXT NOT NULL,
  entityId INTEGER NOT NULL,
  field TEXT NOT NULL,
  beforeValue TEXT NOT NULL,
  afterValue TEXT NOT NULL,
  restoredAt TEXT
)`

export const HISTORY_FIELDS = {
  media: ['name', 'rating', 'favorite', 'bookmark', 'views', 'mediaCreatedAt', 'mediaTypeId'],
  tag: ['name', 'synonyms', 'rating', 'favorite', 'bookmark', 'country', 'color', 'views', 'metaId', 'parentTagId'],
  mark: ['type', 'text', 'time', 'end', 'tagId', 'mediaId', 'icon', 'deletedAt'],
} as const

/** TEMP triggers belong to this connection; database tools can still open the file
 * without needing our SQL functions. Audit rows commit/roll back with the write. */
export function installChangeHistory(sqlite: Database.Database) {
  if (!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='media'").get()) return
  sqlite.exec(HISTORY_TABLE_SQL)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS change_history_operation_idx ON changeHistory(operationId, id);
    CREATE INDEX IF NOT EXISTS change_history_entity_idx ON changeHistory(entityType, entityId, id)`)
  sqlite.function('mc_history_operation', () => operations.getStore()?.id ?? null)
  sqlite.function('mc_history_source', () => operations.getStore()?.source ?? 'system')

  const insert = (entity: string, id: string, field: string, before: string, after: string) => `
    INSERT INTO changeHistory (operationId, source, occurredAt, entityType, entityId, field, beforeValue, afterValue)
    VALUES (COALESCE(mc_history_operation(), lower(hex(randomblob(16)))), mc_history_source(),
      strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), '${entity}', ${id}, ${field}, ${before}, ${after});`
  for (const [entity, fields] of Object.entries(HISTORY_FIELDS)) {
    const table = entity === 'tag' ? 'tags' : entity === 'mark' ? 'marks' : 'media'
    const columns = new Set((sqlite.pragma(`table_info("${table}")`) as {name: string}[]).map(c => c.name))
    for (const field of fields) {
      if (!columns.has(field)) continue
      sqlite.exec(`CREATE TEMP TRIGGER IF NOT EXISTS mc_history_${table}_${field}
        AFTER UPDATE OF "${field}" ON main."${table}" WHEN OLD."${field}" IS NOT NEW."${field}" BEGIN
        ${insert(entity, 'NEW.id', `'${field}'`, `json_quote(OLD."${field}")`, `json_quote(NEW."${field}")`)} END`)
    }
    if (entity === 'mark' && fields.every(field => columns.has(field))) {
      const record = (side: string) => `json_object('id', ${side}.id, ${fields.map(f => `'${f}', ${side}."${f}"`).join(', ')})`
      for (const event of ['INSERT', 'DELETE']) {
        const side = event === 'INSERT' ? 'NEW' : 'OLD'
        sqlite.exec(`CREATE TEMP TRIGGER IF NOT EXISTS mc_history_marks_${event} AFTER ${event} ON main.marks BEGIN
          ${insert('mark', `${side}.id`, "'$record'", event === 'INSERT' ? "'null'" : record(side), event === 'INSERT' ? record(side) : "'null'")} END`)
      }
    }
  }
  for (const [table, entity, owner, kind] of [
    ['valuesInMedia', 'media', 'mediaId', 'value'],
    ['valuesInTags', 'tag', 'tagId', 'value'],
    ['tagsInMedia', 'media', 'mediaId', 'tag'],
    ['tagsInTags', 'tag', 'parentTagId', 'tag'],
  ]) {
    if (!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) continue
    const field = (side: string) => kind === 'value'
      ? `'value:' || ${side}.metaId` : `'tag:' || ${side}.metaId || ':' || ${side}.tagId`
    const value = (side: string) => kind === 'value' ? `json_object('value', ${side}.value)` : "'true'"
    const keys = [owner, 'metaId', ...(kind === 'tag' ? ['tagId'] : [])]
    const sameKeys = keys.map(key => `OLD."${key}" IS NEW."${key}"`).join(' AND ')
    for (const event of ['INSERT', 'DELETE', ...(kind === 'value' ? ['UPDATE'] : [])]) {
      const side = event === 'DELETE' ? 'OLD' : 'NEW'
      sqlite.exec(`CREATE TEMP TRIGGER IF NOT EXISTS mc_history_${table}_${event} AFTER ${event} ON main."${table}"
        ${event === 'UPDATE' ? `WHEN ${sameKeys} AND OLD.value IS NOT NEW.value` : ''} BEGIN
        ${insert(entity, `${side}."${owner}"`, field(side), event === 'INSERT' ? (kind === 'value' ? "'null'" : "'false'") : value('OLD'),
          event === 'DELETE' ? (kind === 'value' ? "'null'" : "'false'") : value('NEW'))} END`)
    }
    sqlite.exec(`CREATE TEMP TRIGGER IF NOT EXISTS mc_history_${table}_keys AFTER UPDATE ON main."${table}"
      WHEN NOT (${sameKeys}) BEGIN
      ${insert(entity, `OLD."${owner}"`, field('OLD'), value('OLD'), kind === 'value' ? "'null'" : "'false'")}
      ${insert(entity, `NEW."${owner}"`, field('NEW'), kind === 'value' ? "'null'" : "'false'", value('NEW'))} END`)
  }
}
