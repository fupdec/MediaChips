import type Database from 'better-sqlite3'
import {HISTORY_FIELDS, withChangeOperation} from '../db/changeHistory'
import type {HistoryEntity, HistoryField, HistoryOperation, HistoryPage} from '../../shared/changeHistory'

type AuditRow = {
  id: number; operationId: string; entityType: HistoryEntity; entityId: number
  field: string; beforeValue: string; afterValue: string; restoredAt: string | null
}
const tableFor = (entity: HistoryEntity) => entity === 'media' ? 'media' : entity === 'tag' ? 'tags' : 'marks'
const ownerFor = (entity: HistoryEntity) => entity === 'media' ? 'mediaId' : 'tagId'

export class HistoryConflict extends Error {}

// Collapse intermediate delete/insert writes into one visible field change.
const fieldsCte = (where = '') => `WITH grouped AS (
  SELECT operationId, entityType, entityId, field, MIN(id) AS firstId, MAX(id) AS lastId
  FROM changeHistory ${where} GROUP BY operationId, entityType, entityId, field
), fields AS (
  SELECT g.*, first.beforeValue, last.afterValue, last.restoredAt
  FROM grouped g JOIN changeHistory first ON first.id=g.firstId JOIN changeHistory last ON last.id=g.lastId
  WHERE first.beforeValue != last.afterValue
)`

export function listHistory(sqlite: Database.Database, limit: number, offset: number,
  entity?: {type: HistoryEntity; id: number}): HistoryPage<HistoryOperation> {
  const where = entity ? 'WHERE entityType=? AND entityId=?' : ''
  const args = entity ? [entity.type, entity.id] : []
  const items = sqlite.prepare(`${fieldsCte()}, matching AS (
    SELECT DISTINCT operationId FROM fields ${where}
  ) SELECT f.operationId AS id, MAX(h.source) AS source, MIN(h.occurredAt) AS occurredAt,
    COUNT(*) AS fields, COUNT(DISTINCT f.entityType || ':' || f.entityId) AS items,
    SUM(CASE WHEN f.restoredAt IS NULL THEN 1 ELSE 0 END) AS remaining
    FROM fields f JOIN matching m ON m.operationId=f.operationId
    JOIN changeHistory h ON h.id=f.lastId GROUP BY f.operationId
    ORDER BY MAX(f.lastId) DESC LIMIT ? OFFSET ?`).all(...args, limit + 1, offset) as HistoryOperation[]
  return {items: items.slice(0, limit), hasMore: items.length > limit}
}

function operationFields(sqlite: Database.Database, operationId: string, limit?: number, offset = 0): AuditRow[] {
  return sqlite.prepare(`${fieldsCte('WHERE operationId=?')} SELECT firstId AS id, operationId, entityType, entityId,
    field, beforeValue, afterValue, restoredAt FROM fields ORDER BY lastId DESC LIMIT ? OFFSET ?`).all(operationId, limit ?? -1, offset) as AuditRow[]
}

export function historyDetails(sqlite: Database.Database, operationId: string, limit: number, offset: number): HistoryPage<HistoryField> {
  const rows = operationFields(sqlite, operationId, limit + 1, offset)
  const items = rows.slice(0, limit).map(row => {
    const table = tableFor(row.entityType)
    const entity = sqlite.prepare(`SELECT ${row.entityType === 'mark' ? 'text' : 'name'} AS name FROM "${table}" WHERE id=?`).get(row.entityId) as {name: string} | undefined
    const [kind, metaId, tagId] = row.field.split(':')
    let fieldLabel = row.field
    if (kind === 'value' || kind === 'tag') {
      const meta = sqlite.prepare('SELECT name FROM meta WHERE id=?').get(Number(metaId)) as {name: string} | undefined
      const tag = kind === 'tag' ? sqlite.prepare('SELECT name FROM tags WHERE id=?').get(Number(tagId)) as {name: string} | undefined : undefined
      fieldLabel = [meta?.name || `#${metaId}`, tag?.name].filter(Boolean).join(' · ')
    }
    return {id: row.id, entityType: row.entityType, entityId: row.entityId,
      entityName: entity?.name || `#${row.entityId}`, field: row.field, fieldLabel,
      before: JSON.parse(row.beforeValue), after: JSON.parse(row.afterValue), restoredAt: row.restoredAt}
  })
  return {items, hasMore: rows.length > limit}
}

function requireActive(sqlite: Database.Database, table: string, id: number) {
  if (!sqlite.prepare(`SELECT 1 FROM "${table}" WHERE id=? AND (deletedAt IS NULL OR deletedAt='')`).get(id)) {
    throw new HistoryConflict(`Missing or deleted ${table} #${id}`)
  }
}

function restoreField(sqlite: Database.Database, row: AuditRow) {
  const before = JSON.parse(row.beforeValue)
  const after = JSON.parse(row.afterValue)
  const table = tableFor(row.entityType)
  const [kind, metaIdText, tagIdText] = row.field.split(':')
  const metaId = Number(metaIdText), tagId = Number(tagIdText)
  const conflict = () => { throw new HistoryConflict(`Field changed since this operation: ${row.entityType} #${row.entityId} · ${row.field}`) }
  const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  if (row.field === '$record' && row.entityType === 'mark') {
    const existing = sqlite.prepare('SELECT * FROM marks WHERE id=?').get(row.entityId) as Record<string, unknown> | undefined
    const current = existing ? Object.fromEntries(['id', ...HISTORY_FIELDS.mark].map(key => [key, existing[key]])) : null
    if (!equal(current, after)) conflict()
    if (before === null) sqlite.prepare('DELETE FROM marks WHERE id=?').run(row.entityId)
    else {
      requireActive(sqlite, 'media', before.mediaId)
      if (before.tagId) requireActive(sqlite, 'tags', before.tagId)
      const columns = ['id', ...HISTORY_FIELDS.mark]
      if (existing) sqlite.prepare('DELETE FROM marks WHERE id=?').run(row.entityId)
      sqlite.prepare(`INSERT INTO marks (${columns.map(c => `"${c}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...columns.map(c => before[c]))
    }
    return
  }
  // Soft-deleted marks can have their deletedAt field restored.
  const owner = sqlite.prepare(`SELECT * FROM "${table}" WHERE id=?`).get(row.entityId) as Record<string, unknown> | undefined
  if (!owner || (owner.deletedAt && !(row.entityType === 'mark' && row.field === 'deletedAt'))) {
    throw new HistoryConflict(`Missing or deleted ${table} #${row.entityId}`)
  }
  if (row.entityType === 'mark') requireActive(sqlite, 'media', Number(owner.mediaId))
  if (kind === 'value' || kind === 'tag') {
    const meta = sqlite.prepare('SELECT 1 FROM meta WHERE id=?').get(metaId)
    if (!meta) throw new HistoryConflict(`Missing field #${metaId}`)
    const relationTable = kind === 'value'
      ? row.entityType === 'media' ? 'valuesInMedia' : 'valuesInTags'
      : row.entityType === 'media' ? 'tagsInMedia' : 'tagsInTags'
    const ownerKey = kind === 'tag' && row.entityType === 'tag' ? 'parentTagId' : ownerFor(row.entityType)
    const where = `"${ownerKey}"=? AND metaId=?${kind === 'tag' ? ' AND tagId=?' : ''}`
    const args = kind === 'tag' ? [row.entityId, metaId, tagId] : [row.entityId, metaId]
    const existing = sqlite.prepare(`SELECT * FROM "${relationTable}" WHERE ${where}`).get(...args) as {value: string | null} | undefined
    const current = kind === 'tag' ? Boolean(existing) : existing ? {value: existing.value} : null
    if (!equal(current, after)) conflict()
    if (kind === 'tag' && before) requireActive(sqlite, 'tags', tagId)
    sqlite.prepare(`DELETE FROM "${relationTable}" WHERE ${where}`).run(...args)
    if (before !== null && before !== false) {
      if (kind === 'tag') sqlite.prepare(`INSERT INTO "${relationTable}" ("${ownerKey}", metaId, tagId) VALUES (?, ?, ?)`).run(...args)
      else sqlite.prepare(`INSERT INTO "${relationTable}" ("${ownerKey}", metaId, value) VALUES (?, ?, ?)`).run(row.entityId, metaId, before.value)
    }
  } else {
    if (!(HISTORY_FIELDS[row.entityType] as readonly string[]).includes(row.field)) throw new HistoryConflict('Unsupported field')
    if (!equal(owner[row.field], after)) conflict()
    if (row.entityType === 'mark' && before && (row.field === 'tagId' || row.field === 'mediaId')) {
      requireActive(sqlite, row.field === 'tagId' ? 'tags' : 'media', Number(before))
    }
    if (before && row.entityType !== 'mark' && (row.field === 'metaId' || row.field === 'mediaTypeId')) {
      const target = row.field === 'metaId' ? 'meta' : 'mediaTypes'
      if (!sqlite.prepare(`SELECT 1 FROM "${target}" WHERE id=?`).get(Number(before))) throw new HistoryConflict('Required field or media type no longer exists')
    }
    if (before && row.entityType === 'tag' && row.field === 'parentTagId') requireActive(sqlite, 'tags', Number(before))
    sqlite.prepare(`UPDATE "${table}" SET "${row.field}"=?${row.entityType !== 'mark' ? ', updatedAt=?' : ''} WHERE id=?`)
      .run(...(row.entityType !== 'mark' ? [before, new Date().toISOString(), row.entityId] : [before, row.entityId]))
  }
}

export function restoreHistory(sqlite: Database.Database, operationId: string, fieldId?: number) {
  try {
    return withChangeOperation('history:restore', () => sqlite.transaction(() => {
      const fields = operationFields(sqlite, operationId).filter(row => !row.restoredAt && (fieldId === undefined || row.id === fieldId))
      if (!fields.length) throw new HistoryConflict('No unrestored changes found')
      for (const row of fields) {
        restoreField(sqlite, row)
        sqlite.prepare(`UPDATE changeHistory SET restoredAt=? WHERE operationId=? AND entityType=? AND entityId=? AND field=?`)
          .run(new Date().toISOString(), operationId, row.entityType, row.entityId, row.field)
      }
      return {restored: fields.length, markIds: [...new Set(fields.filter(row => row.entityType === 'mark'
        && (row.field === 'time' || row.field === '$record')).map(row => row.entityId))]}
    }).immediate())
  } catch (error) {
    if ((error as {code?: string})?.code?.startsWith('SQLITE_CONSTRAINT')) throw new HistoryConflict('Restored value conflicts with existing library data')
    throw error
  }
}
