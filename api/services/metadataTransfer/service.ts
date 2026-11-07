import {createHash} from 'node:crypto'
import {getTableColumns, getTableName, type Table} from 'drizzle-orm'
import * as schema from '../../db/schema'
import type {ApiDb} from '../../types/db'
import {HttpError} from '../../types/errors'
import {buildFolderTagPrefixIndex, matchInheritedFolderTagsWithIndex} from '../mediaInheritedFolderTags'
import {
  METADATA_FORMAT, METADATA_VERSION, MetadataBundleSchema, metadataNativeValue,
  type MetadataBundle, type MetadataRow, type MetadataScalar, type MetadataPreview,
  type MetadataConflict, type MetadataResolution,
} from '../../../shared/metadataTransfer'

const tables = {
  fields: schema.meta, tags: schema.tags, media: schema.media, mediaTypes: schema.mediaTypes,
  marks: schema.marks, mediaTags: schema.tagsInMedia, tagTags: schema.tagsInTags,
  mediaValues: schema.valuesInMedia, tagValues: schema.valuesInTags,
  fieldAssignments: schema.metaInMediaTypes, fieldPins: schema.pinnedMetas,
}
type Key = keyof typeof tables
type Row = Record<string, MetadataScalar>
const excluded = new Set(['oldId', 'deletedAt', 'trashOriginalPath', 'trashOriginalName', 'trashPurgeFile'])
const columns = (key: Key) => Object.values(getTableColumns(tables[key] as Table)).filter(c => !excluded.has(c.name))
const quote = (s: string) => `"${s.replace(/"/g, '""')}"`
const name = (key: Key) => quote(getTableName(tables[key]))
const normalize = (v: unknown) => String(v ?? '').trim().toLowerCase()
function canonical(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(canonical).sort())
  if (value && typeof value === 'object') return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])))
  return JSON.stringify(value)
}
function fail(message: string): never { throw new HttpError(400, message) }
function read(db: ApiDb, key: Key, where = '', params: unknown[] = []): Row[] {
  const cs = columns(key)
  const active = ['media', 'tags', 'marks'].includes(key) ? '(deletedAt IS NULL OR deletedAt = \'\')' : ''
  const condition = [active, where].filter(Boolean).join(' AND ')
  return (db.sqlite.prepare(`SELECT ${cs.map(c => quote(c.name)).join(',')} FROM ${name(key)}${condition ? ` WHERE ${condition}` : ''}`).all(...params) as Row[]).map(row => {
    for (const c of cs) if (c.columnType === 'SQLiteBoolean' && row[c.name] !== null) row[c.name] = Boolean(row[c.name])
    return row
  })
}
function selected(db: ApiDb, key: Key, column: string, ids: Set<number>): Row[] {
  if (!ids.size) return []
  return read(db, key, `${quote(column)} IN (SELECT value FROM json_each(?))`, [JSON.stringify([...ids])])
}
const idsOf = (rows: Row[]) => new Set(rows.map(r => Number(r.id)))


function effectiveMediaTags(db: ApiDb, media: Row[]): Row[] {
  const direct = selected(db, 'mediaTags', 'mediaId', idsOf(media))
  const folders = db.sqlite.prepare(`SELECT fp.path AS folderPath, tf.tagId, tf.metaId
    FROM tagsInFolders tf JOIN folderPaths fp ON fp.id = tf.folderId
    JOIN tags t ON t.id = tf.tagId WHERE t.deletedAt IS NULL OR t.deletedAt = ''`).all() as Array<{folderPath: string; tagId: number; metaId: number}>
  const inherited = matchInheritedFolderTagsWithIndex(media.map(r => ({id: Number(r.id), path: String(r.path)})), buildFolderTagPrefixIndex(folders))
  return [...new Map([...direct, ...inherited].map(r => [`${r.mediaId}:${r.metaId}:${r.tagId}`, {...r}])).values()]
}

export function exportMetadata(db: ApiDb, mediaIds: number[]): MetadataBundle {
  return db.sqlite.transaction(() => {
    const media = selected(db, 'media', 'id', new Set(mediaIds))
    if (media.length !== new Set(mediaIds).size) fail('Some selected cards are missing or in Trash')
    const ids = idsOf(media)
    const mediaTypes = selected(db, 'mediaTypes', 'id', new Set(media.map(r => Number(r.mediaTypeId)).filter(Boolean)))
    const mediaTags = effectiveMediaTags(db, media)
    const mediaValues = selected(db, 'mediaValues', 'mediaId', ids)
    const marks = selected(db, 'marks', 'mediaId', ids)
    const tagIds = new Set([...mediaTags, ...marks].map(r => Number(r.tagId)).filter(Boolean))
    let tags: Row[] = [], tagTags: Row[] = [], tagValues: Row[] = []
    for (;;) {
      tags = selected(db, 'tags', 'id', tagIds)
      tagTags = selected(db, 'tagTags', 'parentTagId', tagIds)
      tagValues = selected(db, 'tagValues', 'tagId', tagIds)
      const before = tagIds.size
      for (const r of [...tags, ...tagTags]) for (const k of ['tagId', 'parentTagId']) if (r[k]) tagIds.add(Number(r[k]))
      if (tagIds.size > 100_000) fail('Too many related tags')
      if (before === tagIds.size) break
    }
    const fieldAssignments = selected(db, 'fieldAssignments', 'mediaTypeId', idsOf(mediaTypes))
    const fieldIds = new Set([...mediaTags, ...mediaValues, ...tags, ...tagTags, ...tagValues, ...fieldAssignments].map(r => Number(r.metaId)).filter(Boolean))
    let fields: Row[] = [], fieldPins: Row[] = []
    for (;;) {
      fields = selected(db, 'fields', 'id', fieldIds)
      fieldPins = selected(db, 'fieldPins', 'metaId', fieldIds)
      const before = fieldIds.size
      for (const r of fields) if (r.parentMetaId) fieldIds.add(Number(r.parentMetaId))
      for (const r of fieldPins) fieldIds.add(Number(r.pinnedMetaId))
      if (fieldIds.size > 100_000) fail('Too many related fields')
      if (before === fieldIds.size) break
    }
    const exportedFieldIds = idsOf(fields)
    const hasField = (row: Row) => exportedFieldIds.has(Number(row.metaId))
    // Legacy databases may retain tags or parent links after a field was removed.
    const exportedTags = tags.filter(hasField)
    const exportedTagIds = idsOf(exportedTags)
    const hasTag = (row: Row) => exportedTagIds.has(Number(row.tagId))
    const types = new Map(fields.map(r => [r.id, String(r.type)]))
    const values = (rows: Row[]) => rows.filter(hasField).map(r => ({...r, rawValue: r.value, value: metadataNativeValue(types.get(r.metaId)!, r.value as string | null)}))
    const bundle = MetadataBundleSchema.parse({format: METADATA_FORMAT, version: METADATA_VERSION,
      exportedAt: new Date().toISOString(),
      fields: fields.map(r => ({...r, parentMetaId: exportedFieldIds.has(Number(r.parentMetaId)) ? r.parentMetaId : null})),
      tags: exportedTags.map(r => ({...r, parentTagId: exportedTagIds.has(Number(r.parentTagId)) ? r.parentTagId : null})),
      media, mediaTypes, marks: marks.map(r => ({...r, tagId: hasTag(r) ? r.tagId : null})),
      mediaTags: mediaTags.filter(r => hasField(r) && hasTag(r)),
      tagTags: tagTags.filter(r => hasField(r) && hasTag(r) && exportedTagIds.has(Number(r.parentTagId))),
      mediaValues: values(mediaValues), tagValues: values(tagValues.filter(hasTag)),
      fieldAssignments: fieldAssignments.filter(hasField),
      fieldPins: fieldPins.filter(r => hasField(r) && exportedFieldIds.has(Number(r.pinnedMetaId)))})
    validateBundle(bundle)
    return bundle
  })()
}

function validateBundle(bundle: MetadataBundle) {
  const idSets = {} as Record<Key, Set<number>>
  for (const key of ['fields', 'tags', 'media', 'mediaTypes', 'marks'] as const) {
    const cs = columns(key)
    idSets[key] = new Set()
    for (const row of bundle[key]) {
      if (idSets[key].has(row.id)) fail(`Duplicate ${key} ID ${row.id}`)
      idSets[key].add(row.id)
      for (const k of Object.keys(row)) if (!cs.some(c => c.name === k)) fail(`Unknown ${key} column: ${k}`)
      for (const c of cs) {
        const v = row[c.name]
        if (v === undefined || (v === null && c.notNull)) fail(`Missing ${key}.${c.name}`)
        if (v === null) continue
        const type = c.columnType === 'SQLiteBoolean' ? 'boolean' : c.dataType
        if (typeof v !== type || (type === 'number' && !Number.isFinite(v))) fail(`Invalid ${key}.${c.name} type`)
      }
    }
  }
  for (const key of ['tags', 'fields', 'media', 'mediaTypes'] as const) {
    const names = new Set<string>()
    for (const r of bundle[key]) {
      const name = key === 'media' ? String(r.path) : `${normalize(r.name)}:${key === 'fields' ? r.parentMetaId : ''}`
      if (names.has(name)) fail(`Duplicate ${key} identity: ${r.name || r.path}`)
      names.add(name)
    }
  }
  const ref = (key: Key, value: MetadataScalar | undefined, optional = false) => {
    if (optional && value === null) return
    if (typeof value !== 'number' || !idSets[key].has(value)) fail(`Dangling reference to ${key}: ${value}`)
  }
  const fields = new Map(bundle.fields.map(r => [r.id, r]))
  const tags = new Map(bundle.tags.map(r => [r.id, r]))
  for (const r of bundle.fields) {
    if (!['array', 'string', 'number', 'boolean', 'date', 'rating'].includes(String(r.type))) fail('Unknown field type')
    if (!String(r.name ?? '').trim()) fail('Empty field name')
    ref('fields', r.parentMetaId, true)
  }
  for (const r of bundle.tags) {
    if (!String(r.name).trim()) fail('Empty tag name')
    ref('fields', r.metaId); ref('tags', r.parentTagId, true)
    if (fields.get(Number(r.metaId))?.type !== 'array') fail('A tag must belong to an array field')
  }
  for (const r of bundle.media) { if (!String(r.path ?? '').trim()) fail('Empty media path'); ref('mediaTypes', r.mediaTypeId, true) }
  for (const r of bundle.marks) { ref('media', r.mediaId); ref('tags', r.tagId, true) }
  for (const [key, ownerKey, owner] of [['mediaTags', 'mediaId', 'media'], ['tagTags', 'parentTagId', 'tags']] as const) {
    for (const r of bundle[key]) {
      ref(owner, (r as Row)[ownerKey]); ref('tags', r.tagId); ref('fields', r.metaId)
      if (tags.get(r.tagId)?.metaId !== r.metaId) fail('Tag category does not match relation')
    }
  }
  for (const [key, ownerKey, owner] of [['mediaValues', 'mediaId', 'media'], ['tagValues', 'tagId', 'tags']] as const) {
    for (const r of bundle[key]) {
      ref(owner, (r as Row)[ownerKey]); ref('fields', r.metaId)
      const type = String(fields.get(r.metaId)?.type)
      if (type === 'array' || r.value !== metadataNativeValue(type, r.rawValue)) fail('Value type does not match its field or rawValue')
    }
  }
  for (const r of bundle.fieldAssignments) { ref('fields', r.metaId); ref('mediaTypes', r.mediaTypeId) }
  for (const r of bundle.fieldPins) { ref('fields', r.metaId); ref('fields', r.pinnedMetaId) }
  // Reject duplicate edges/values instead of silently discarding them on import.
  for (const [key, keys] of Object.entries({mediaTags: ['mediaId', 'metaId', 'tagId'], tagTags: ['parentTagId', 'metaId', 'tagId'], mediaValues: ['mediaId', 'metaId'], tagValues: ['tagId', 'metaId'], fieldAssignments: ['metaId', 'mediaTypeId'], fieldPins: ['metaId', 'pinnedMetaId']}) as [Key, string[]][]) {
    const seen = new Set<string>()
    for (const row of bundle[key] as Row[]) { const k = keys.map(k => row[k]).join(':'); if (seen.has(k)) fail(`Duplicate ${key} relation`); seen.add(k) }
  }
  for (const [key, parent] of [['fields', 'parentMetaId'], ['tags', 'parentTagId']] as const) topological(bundle[key], parent)
}
function topological(rows: MetadataRow[], parent: string): MetadataRow[] {
  const byId = new Map(rows.map(r => [r.id, r])), done = new Set<number>(), out: MetadataRow[] = []
  for (const row of rows) {
    const chain: MetadataRow[] = [], visiting = new Set<number>()
    let current: MetadataRow | undefined = row
    while (current && !done.has(current.id)) {
      if (visiting.has(current.id)) fail(`Cycle in ${parent}`)
      visiting.add(current.id); chain.push(current)
      const parentId: MetadataScalar = current[parent]
      current = parentId ? byId.get(Number(parentId)) : undefined
      if (parentId && !current) fail(`Dangling ${parent}`)
    }
    for (const entry of chain.reverse()) { done.add(entry.id); out.push(entry) }
  }
  return out
}
function write(db: ApiDb, key: Key, row: Row, updateId?: number): number {
  const data = Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'id').map(([k, v]) => [k, typeof v === 'boolean' ? Number(v) : v]))
  const keys = Object.keys(data)
  if (updateId) {
    db.sqlite.prepare(`UPDATE ${name(key)} SET ${keys.map(k => `${quote(k)} = ?`).join(',')} WHERE id = ?`).run(...Object.values(data), updateId)
    return updateId
  }
  return Number(db.sqlite.prepare(`INSERT INTO ${name(key)} (${keys.map(quote).join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(data)).lastInsertRowid)
}
function importSnapshot(db: ApiDb, bundle: MetadataBundle) {
  const matches = {} as Record<'media' | 'tags' | 'fields' | 'mediaTypes', Row[]>
  const hash = createHash('sha256').update(JSON.stringify(bundle))
  for (const key of ['media', 'tags', 'fields', 'mediaTypes'] as const) {
    const identity = key === 'media' ? 'path' : 'name'
    const expression = key === 'media' ? 'path' : 'lower(trim(name))'
    const parameter = key === 'media' ? 'value' : 'lower(trim(value))'
    matches[key] = read(db, key, `${expression} IN (SELECT ${parameter} FROM json_each(?))`, [JSON.stringify(bundle[key].map(r => r[identity]))])
    hash.update(canonical(matches[key]))
  }
  for (const [key, owner, ids] of [
    ['mediaTags', 'mediaId', idsOf(matches.media)], ['mediaValues', 'mediaId', idsOf(matches.media)],
    ['marks', 'mediaId', idsOf(matches.media)], ['tagTags', 'parentTagId', idsOf(matches.tags)],
    ['tagValues', 'tagId', idsOf(matches.tags)], ['fieldAssignments', 'metaId', idsOf(matches.fields)],
    ['fieldPins', 'metaId', idsOf(matches.fields)],
  ] as [Key, string, Set<number>][]) hash.update(canonical(selected(db, key, owner, ids)))
  const effectiveTags = effectiveMediaTags(db, matches.media)
  hash.update(canonical(effectiveTags))
  // New local IDs must remain stable between review and application, even if an
  // unrelated insert occurs. Preview's savepoint rolls these sequences back.
  hash.update(canonical(db.sqlite.prepare("SELECT name, seq FROM sqlite_sequence WHERE name IN ('media', 'tags', 'meta', 'mediaTypes')").all()))
  return {token: hash.digest('hex'), matches, effectiveTags}
}

export function transferMetadata(db: ApiDb, input: unknown, options?: {token: string; resolutions: Record<string, MetadataResolution>}): MetadataPreview {
  const bundle = MetadataBundleSchema.parse(input)
  validateBundle(bundle)
  const rollback = Symbol('metadata-preview')
  let result: MetadataPreview | undefined
  try {
    db.sqlite.transaction(() => {
      const {token, matches, effectiveTags} = importSnapshot(db, bundle)
      const effectiveTagsByMedia = new Map<number, Row[]>()
      for (const r of effectiveTags) effectiveTagsByMedia.set(Number(r.mediaId), [...(effectiveTagsByMedia.get(Number(r.mediaId)) ?? []), r])
      if (options && options.token !== token) throw new HttpError(409, 'Library changed. Preview the import again.')
      const initialIds = {media: idsOf(matches.media), tags: idsOf(matches.tags)}
      const conflicts: MetadataConflict[] = []
      const maps = {fields: new Map<number, number>(), tags: new Map<number, number>(), media: new Map<number, number>(), mediaTypes: new Map<number, number>()}
      const resolve = (key: string, entity: string, label: string, current: Record<string, unknown>, incoming: Record<string, unknown>, blocked = false) => {
        if (canonical(current) === canonical(incoming)) return false
        conflicts.push({key, entity, name: label, current, incoming, blocked})
        return !blocked && options?.resolutions[key] === 'replace'
      }
      const withoutId = (r: Row) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'id'))
      for (const key of ['mediaTypes', 'fields', 'tags', 'media'] as const) {
        const identity = (row: Row) => key === 'media' ? String(row.path) : `${normalize(row.name)}:${key === 'fields' ? row.parentMetaId : ''}`
        const byIdentity = new Map<string, Row[]>()
        for (const row of matches[key]) {
          const k = identity(row)
          byIdentity.set(k, [...(byIdentity.get(k) ?? []), row])
        }
        const ordered = key === 'fields' ? topological(bundle.fields, 'parentMetaId') : key === 'tags' ? topological(bundle.tags, 'parentTagId') : bundle[key]
        const matched = new Set<number>()
        for (const r of ordered) {
          const row: Row = {...r}
          if (key === 'fields' && row.parentMetaId) row.parentMetaId = maps.fields.get(Number(row.parentMetaId))!
          if (key === 'tags') { row.metaId = maps.fields.get(Number(row.metaId))!; if (row.parentTagId) row.parentTagId = maps.tags.get(Number(row.parentTagId))! }
          if (key === 'media' && row.mediaTypeId) row.mediaTypeId = maps.mediaTypes.get(Number(row.mediaTypeId))!
          const candidates = byIdentity.get(identity(row)) ?? []
          if (candidates.length > 1) fail(`Ambiguous ${key} match: ${row.name}`)
          const current = candidates[0]
          if (current && matched.has(Number(current.id))) fail(`Multiple incoming ${key} match the same item`)
          const target = current ? Number(current.id) : write(db, key, row)
          matched.add(target); maps[key].set(r.id, target)
          if (!current) continue
          const blocked = ((key === 'fields' || key === 'mediaTypes') && current.type !== row.type) || (key === 'tags' && current.metaId !== row.metaId)
          // Media and tag conflicts include their relationships below as one decision.
          if (key === 'media' || key === 'tags') continue
          if (resolve(`${key}:${r.id}`, key, String(row.name), withoutId(current), withoutId(row), blocked)) write(db, key, row, target)
        }
      }
      const remap = (r: Row): Row => {
        const out = {...r}
        for (const [column, map] of Object.entries({mediaId: maps.media, metaId: maps.fields, pinnedMetaId: maps.fields, tagId: maps.tags, parentTagId: maps.tags})) if (out[column] !== null && out[column] !== undefined) out[column] = map.get(Number(out[column]))!
        if ('rawValue' in out) { out.value = out.rawValue; delete out.rawValue }
        return out
      }
      const ownerRelations = (key: 'media' | 'tags', sourceId: number, targetId: number, incoming: boolean) => {
        const spec = key === 'media' ? {mediaTags: 'mediaId', mediaValues: 'mediaId', marks: 'mediaId'} : {tagTags: 'parentTagId', tagValues: 'tagId'}
        const out: Record<string, Row[]> = {}
        for (const [rel, column] of Object.entries(spec) as [Key, string][]) out[rel] = incoming
          ? (bundle[rel] as Row[]).filter(r => r[column] === sourceId).map(r => { const row = remap(r); delete row.id; return row })
          : (rel === 'mediaTags' ? (effectiveTagsByMedia.get(targetId) ?? []).map(r => ({...r})) : read(db, rel, `${quote(column)} = ?`, [targetId])).map(r => { delete r.id; return r })
        return out
      }
      for (const key of ['tags', 'media'] as const) for (const r of bundle[key]) {
        const target = maps[key].get(r.id)!
        const current = read(db, key, 'id = ?', [target])[0]
        const incoming: Row = {...r, id: target}
        if (key === 'tags') { incoming.metaId = maps.fields.get(Number(r.metaId))!; incoming.parentTagId = r.parentTagId ? maps.tags.get(Number(r.parentTagId))! : null }
        if (key === 'media') incoming.mediaTypeId = r.mediaTypeId ? maps.mediaTypes.get(Number(r.mediaTypeId))! : null
        const rels = ownerRelations(key, r.id, target, true)
        // Newly inserted records have no relations and must always receive the incoming graph.
        const wasExisting = initialIds[key].has(target)
        const directTags = key === 'media' ? read(db, 'mediaTags', 'mediaId = ?', [target]) : []
        const inheritedRemoval = key === 'media' && (effectiveTagsByMedia.get(target) ?? []).some(edge =>
          !directTags.some(r => canonical(r) === canonical(edge)) && !rels.mediaTags.some(r => canonical(r) === canonical(edge)))
        const blocked = (key === 'tags' && current.metaId !== incoming.metaId) || inheritedRemoval
        const apply = !wasExisting || resolve(`${key}:${r.id}`, key, String(r.name || r.path),
          {...withoutId(current), ...ownerRelations(key, r.id, target, false)}, {...withoutId(incoming), ...rels}, blocked)
        if (apply) {
          write(db, key, incoming, target)
          for (const [rel, rows] of Object.entries(rels) as [Key, Row[]][]) {
            const column = key === 'media' ? 'mediaId' : rel === 'tagTags' ? 'parentTagId' : 'tagId'
            db.sqlite.prepare(`DELETE FROM ${name(rel)} WHERE ${quote(column)} = ?${rel === 'marks' ? " AND (deletedAt IS NULL OR deletedAt = '')" : ''}`).run(target)
            for (const row of rows) write(db, rel, row)
          }
        }
      }
      for (const key of ['fieldAssignments', 'fieldPins'] as const) for (const r of bundle[key]) {
        const row = remap(r)
        if (key === 'fieldAssignments') row.mediaTypeId = maps.mediaTypes.get(Number((r as Row).mediaTypeId))!
        const keys = key === 'fieldAssignments' ? ['metaId', 'mediaTypeId'] : ['metaId', 'pinnedMetaId']
        const where = keys.map(k => `${quote(k)} = ?`).join(' AND ')
        const current = read(db, key, where, keys.map(k => row[k]))[0]
        if (!current) write(db, key, row)
        else if (resolve(`${key}:${keys.map(k => r[k as keyof typeof r]).join(':')}`, key, keys.map(k => row[k]).join(' / '), current, row)) {
          db.sqlite.prepare(`DELETE FROM ${name(key)} WHERE ${where}`).run(...keys.map(k => row[k]))
          write(db, key, row)
        }
      }
      for (const [key, parent] of [['tags', 'parentTagId'], ['fields', 'parentMetaId']] as const) {
        const cache = new Map<number, MetadataRow | undefined>(), done = new Set<number>()
        for (const target of maps[key].values()) {
          const seen = new Set<number>(); let id: number | null = target
          while (id && !done.has(id)) {
            if (seen.has(id)) fail(`Import would create a cycle in ${parent}`)
            seen.add(id)
            if (!cache.has(id)) cache.set(id, read(db, key, 'id = ?', [id])[0] as MetadataRow | undefined)
            const row: MetadataRow | undefined = cache.get(id)
            id = row?.[parent] ? Number(row[parent]) : null
          }
          for (const id of seen) done.add(id)
        }
      }
      result = {token, conflicts, counts: {media: bundle.media.length, fields: bundle.fields.length, tags: bundle.tags.length, marks: bundle.marks.length}}
      if (!options) throw rollback
      if (conflicts.some(c => c.blocked || !options.resolutions[c.key])) throw new HttpError(409, 'Resolve every conflict before importing', {conflicts})
      if (Object.keys(options.resolutions).some(k => !conflicts.some(c => c.key === k))) fail('Unknown conflict resolution')
    })()
  } catch (err) { if (err !== rollback) throw err }
  return result!
}
