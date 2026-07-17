import Database from 'better-sqlite3'
import {
  formatSynonyms,
  joinStashFilePath,
  toIsoTimestamp,
} from './mapEntities'
import type {
  StashLibrarySnapshot,
  StashPerformer,
  StashScene,
  StashSceneMarker,
  StashStudio,
  StashTag,
} from './types'

type SqliteDb = Database.Database

function tableExists(db: SqliteDb, name: string): boolean {
  const row = db.prepare(
    `SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
  ).get(name) as {ok: number} | undefined
  return Boolean(row?.ok)
}

function readAliases(db: SqliteDb, table: string, idColumn: string, aliasColumn: string, id: number): string[] {
  if (!tableExists(db, table)) return []
  const rows = db.prepare(
    `SELECT ${aliasColumn} AS alias FROM ${table} WHERE ${idColumn} = ?`,
  ).all(id) as Array<{alias: string | null}>
  return rows.map((row) => String(row.alias || '').trim()).filter(Boolean)
}

function readPerformers(db: SqliteDb): StashPerformer[] {
  if (!tableExists(db, 'performers')) return []
  const rows = db.prepare(`
    SELECT id, name, country, favorite, rating
    FROM performers
    ORDER BY id
  `).all() as Array<{
    id: number
    name: string | null
    country: string | null
    favorite: number | boolean | null
    rating: number | null
  }>

  return rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name || '').trim() || `Performer ${row.id}`,
    country: row.country ? String(row.country) : null,
    favorite: Boolean(row.favorite),
    rating: row.rating == null ? null : Number(row.rating),
    aliases: readAliases(db, 'performer_aliases', 'performer_id', 'alias', Number(row.id)),
  }))
}

function readStudios(db: SqliteDb): StashStudio[] {
  if (!tableExists(db, 'studios')) return []
  const rows = db.prepare(`
    SELECT id, name, favorite, rating
    FROM studios
    ORDER BY id
  `).all() as Array<{
    id: number
    name: string | null
    favorite: number | boolean | null
    rating: number | null
  }>

  return rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name || '').trim() || `Studio ${row.id}`,
    favorite: Boolean(row.favorite),
    rating: row.rating == null ? null : Number(row.rating),
    aliases: readAliases(db, 'studio_aliases', 'studio_id', 'alias', Number(row.id)),
  }))
}

function readTags(db: SqliteDb): StashTag[] {
  if (!tableExists(db, 'tags')) return []
  const rows = db.prepare(`
    SELECT id, name, favorite
    FROM tags
    ORDER BY id
  `).all() as Array<{
    id: number
    name: string | null
    favorite: number | boolean | null
  }>

  return rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name || '').trim() || `Tag ${row.id}`,
    favorite: Boolean(row.favorite),
    aliases: readAliases(db, 'tag_aliases', 'tag_id', 'alias', Number(row.id)),
  }))
}

function readSceneLinks(db: SqliteDb): {
  performersByScene: Map<number, number[]>
  tagsByScene: Map<number, number[]>
} {
  const performersByScene = new Map<number, number[]>()
  const tagsByScene = new Map<number, number[]>()

  if (tableExists(db, 'performers_scenes')) {
    const rows = db.prepare(`
      SELECT scene_id, performer_id FROM performers_scenes
    `).all() as Array<{scene_id: number; performer_id: number}>
    for (const row of rows) {
      const sceneId = Number(row.scene_id)
      const list = performersByScene.get(sceneId) || []
      list.push(Number(row.performer_id))
      performersByScene.set(sceneId, list)
    }
  }

  if (tableExists(db, 'scenes_tags')) {
    const rows = db.prepare(`
      SELECT scene_id, tag_id FROM scenes_tags
    `).all() as Array<{scene_id: number; tag_id: number}>
    for (const row of rows) {
      const sceneId = Number(row.scene_id)
      const list = tagsByScene.get(sceneId) || []
      list.push(Number(row.tag_id))
      tagsByScene.set(sceneId, list)
    }
  }

  return {performersByScene, tagsByScene}
}

function readMarkersByScene(db: SqliteDb): Map<number, StashSceneMarker[]> {
  const markersByScene = new Map<number, StashSceneMarker[]>()
  if (!tableExists(db, 'scene_markers')) return markersByScene

  const rows = db.prepare(`
    SELECT id, scene_id, title, seconds, end_seconds, primary_tag_id
    FROM scene_markers
    ORDER BY scene_id, seconds, id
  `).all() as Array<{
    id: number
    scene_id: number
    title: string | null
    seconds: number | null
    end_seconds: number | null
    primary_tag_id: number | null
  }>

  for (const row of rows) {
    const sceneId = Number(row.scene_id)
    const list = markersByScene.get(sceneId) || []
    list.push({
      id: Number(row.id),
      sceneId,
      title: String(row.title || '').trim(),
      seconds: Number(row.seconds) || 0,
      endSeconds: row.end_seconds == null ? null : Number(row.end_seconds),
      primaryTagId: row.primary_tag_id == null ? null : Number(row.primary_tag_id),
    })
    markersByScene.set(sceneId, list)
  }

  return markersByScene
}

function fingerprintSelect(db: SqliteDb, type: string): string {
  if (!tableExists(db, 'files_fingerprints')) return 'NULL'
  return `(
    SELECT fingerprint FROM files_fingerprints
    WHERE file_id = f.id AND type = '${type}'
    LIMIT 1
  )`
}

function viewsSelect(db: SqliteDb): {views: string; viewedAt: string} {
  if (!tableExists(db, 'scenes_view_dates')) {
    return {views: '0', viewedAt: 'NULL'}
  }
  return {
    views: `(SELECT COUNT(*) FROM scenes_view_dates WHERE scene_id = s.id)`,
    viewedAt: `(SELECT MAX(view_date) FROM scenes_view_dates WHERE scene_id = s.id)`,
  }
}

function readScenes(db: SqliteDb): StashScene[] {
  if (!tableExists(db, 'scenes')) return []

  const hasFiles = tableExists(db, 'files')
    && tableExists(db, 'folders')
    && tableExists(db, 'scenes_files')
  const hasVideoFiles = tableExists(db, 'video_files')
  const {views, viewedAt} = viewsSelect(db)
  const oshashExpr = fingerprintSelect(db, 'oshash')
  const md5Expr = fingerprintSelect(db, 'md5')

  const sql = hasFiles
    ? `
      SELECT
        s.id,
        s.title,
        s.rating,
        s.studio_id,
        ${views} AS views,
        ${viewedAt} AS viewed_at,
        f.basename AS file_basename,
        f.size AS file_size,
        folders.path AS folder_path,
        ${oshashExpr} AS oshash,
        ${md5Expr} AS content_hash,
        ${hasVideoFiles ? 'vf.duration' : 'NULL'} AS duration,
        ${hasVideoFiles ? 'vf.width' : 'NULL'} AS width,
        ${hasVideoFiles ? 'vf.height' : 'NULL'} AS height,
        ${hasVideoFiles ? 'vf.bit_rate' : 'NULL'} AS bit_rate,
        ${hasVideoFiles ? 'vf.frame_rate' : 'NULL'} AS frame_rate,
        ${hasVideoFiles ? 'vf.video_codec' : 'NULL'} AS video_codec
      FROM scenes s
      LEFT JOIN scenes_files sf
        ON sf.scene_id = s.id AND sf."primary" = 1
      LEFT JOIN files f ON f.id = sf.file_id
      LEFT JOIN folders ON folders.id = f.parent_folder_id
      ${hasVideoFiles ? 'LEFT JOIN video_files vf ON vf.file_id = f.id' : ''}
      ORDER BY s.id
    `
    : `
      SELECT
        s.id,
        s.title,
        s.rating,
        s.studio_id,
        ${views} AS views,
        ${viewedAt} AS viewed_at,
        NULL AS file_basename,
        0 AS file_size,
        NULL AS folder_path,
        NULL AS oshash,
        NULL AS content_hash,
        NULL AS duration,
        NULL AS width,
        NULL AS height,
        NULL AS bit_rate,
        NULL AS frame_rate,
        NULL AS video_codec
      FROM scenes s
      ORDER BY s.id
    `

  const rows = db.prepare(sql).all() as Array<{
    id: number
    title: string | null
    rating: number | null
    studio_id: number | null
    views: number | null
    viewed_at: string | null
    file_basename: string | null
    file_size: number | null
    folder_path: string | null
    oshash: string | null
    content_hash: string | null
    duration: number | null
    width: number | null
    height: number | null
    bit_rate: number | null
    frame_rate: number | null
    video_codec: string | null
  }>

  const {performersByScene, tagsByScene} = readSceneLinks(db)
  const markersByScene = readMarkersByScene(db)

  return rows.map((row) => ({
    id: Number(row.id),
    title: row.title ? String(row.title) : null,
    rating: row.rating == null ? null : Number(row.rating),
    studioId: row.studio_id == null ? null : Number(row.studio_id),
    path: joinStashFilePath(row.folder_path, row.file_basename),
    filesize: Number(row.file_size) || 0,
    oshash: row.oshash ? String(row.oshash) : null,
    contentHash: row.content_hash ? String(row.content_hash) : null,
    views: Number(row.views) || 0,
    viewedAt: toIsoTimestamp(row.viewed_at),
    duration: row.duration == null ? null : Math.round(Number(row.duration)),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    bitrate: row.bit_rate == null ? null : Number(row.bit_rate),
    fps: row.frame_rate == null ? null : Math.round(Number(row.frame_rate)),
    codec: row.video_codec ? String(row.video_codec) : null,
    performerIds: performersByScene.get(Number(row.id)) || [],
    tagIds: tagsByScene.get(Number(row.id)) || [],
    markers: markersByScene.get(Number(row.id)) || [],
  }))
}

export function openStashDb(dbPath: string): SqliteDb {
  return new Database(dbPath, {readonly: true, fileMustExist: true})
}

export function isStashDatabase(db: SqliteDb): boolean {
  return tableExists(db, 'scenes')
}

export function readStashLibrary(db: SqliteDb): StashLibrarySnapshot {
  return {
    performers: readPerformers(db),
    studios: readStudios(db),
    tags: readTags(db),
    scenes: readScenes(db),
  }
}

export function loadStashLibraryFromPath(dbPath: string): StashLibrarySnapshot {
  const db = openStashDb(dbPath)
  try {
    if (!isStashDatabase(db)) {
      throw new Error('Selected file does not look like a Stash database (missing scenes table)')
    }
    return readStashLibrary(db)
  } finally {
    db.close()
  }
}

/** Exported for tests that build synonym strings from aliases. */
export {formatSynonyms}
