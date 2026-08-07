import type Database from 'better-sqlite3'
import { renameDuplicateTagNames } from './ensureGlobalUniqueTagNames'

const IMAGE_EXTENSIONS = 'jpg,jpeg,bmp,png,webp,gif,tiff,tif,heic,avif,svg'
const LEGACY_IMAGE_EXTENSIONS = 'jpg,jpeg,bmp,png'

function backfillMediaNames(sqlite: Database.Database) {
  const rows = sqlite.prepare(`
    SELECT id, path FROM media
    WHERE path IS NOT NULL AND (name IS NULL OR name = '' OR ext IS NULL OR ext = '' OR basename IS NULL OR basename = '')
  `).all() as Array<{id: number; path: string}>

  if (!rows.length) {
    return
  }

  const update = sqlite.prepare(`
    UPDATE media
    SET basename = ?, name = ?, ext = ?, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ?
  `)

  for (const row of rows) {
    const normalized = row.path.replace(/\\/g, '/')
    const basename = normalized.split('/').pop() ?? ''
    const dotIndex = basename.lastIndexOf('.')
    const name = dotIndex > 0 ? basename.slice(0, dotIndex) : basename
    const ext = dotIndex > 0 ? basename.slice(dotIndex + 1).toLowerCase() : ''
    update.run(basename, name, ext, row.id)
  }
}

function upgradeImageMediaType(sqlite: Database.Database) {
  sqlite.prepare(`
    UPDATE mediaTypes
    SET hidden = 0, extensions = ?, updatedAt = CURRENT_TIMESTAMP
    WHERE type = 'image' AND (hidden = 1 OR extensions = ?)
  `).run(IMAGE_EXTENSIONS, LEGACY_IMAGE_EXTENSIONS)
}

function copyVideoMetaAssignmentsToImage(sqlite: Database.Database) {
  const videoType = sqlite.prepare(
    `SELECT id FROM mediaTypes WHERE type = 'video' ORDER BY id LIMIT 1`,
  ).get() as {id: number} | undefined
  const imageType = sqlite.prepare(
    `SELECT id FROM mediaTypes WHERE type = 'image' ORDER BY id LIMIT 1`,
  ).get() as {id: number} | undefined

  if (!videoType || !imageType) {
    return
  }

  const assignments = sqlite.prepare(`
    SELECT metaId, "order", scraper, show
    FROM metaInMediaTypes
    WHERE mediaTypeId = ?
  `).all(videoType.id) as Array<{
    metaId: number
    order: number | null
    scraper: string | null
    show: number | boolean | null
  }>

  const insert = sqlite.prepare(`
    INSERT INTO metaInMediaTypes (metaId, mediaTypeId, "order", scraper, show)
    SELECT ?, ?, ?, ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM metaInMediaTypes WHERE metaId = ? AND mediaTypeId = ?
    )
  `)

  for (const row of assignments) {
    insert.run(
      row.metaId,
      imageType.id,
      row.order ?? 1,
      row.scraper,
      row.show ?? 1,
      row.metaId,
      imageType.id,
    )
  }
}

function dedupeDefaultMediaTypes(sqlite: Database.Database) {
  sqlite.exec(`
    DELETE FROM mediaTypes
    WHERE custom = 0 AND id NOT IN (
      SELECT MIN(id) FROM mediaTypes WHERE custom = 0 GROUP BY type
    )
  `)
}

/** One-shot: stop showing filesize/views/media-count chips on cards by default. */
function hideDefaultMetaChipsOnCards(sqlite: Database.Database) {
  const flag = 'migration.hide_card_default_meta_v1'
  const existing = sqlite.prepare(
    'SELECT 1 AS ok FROM settings WHERE option = ? LIMIT 1',
  ).get(flag) as {ok: number} | undefined
  if (existing) return

  const update = sqlite.prepare(`
    UPDATE settings
    SET value = '0', updatedAt = CURRENT_TIMESTAMP
    WHERE option = ?
  `)
  for (const option of [
    'show_default_meta_filesize',
    'show_default_meta_number_media',
    'show_default_meta_number_views',
  ]) {
    update.run(option)
  }

  sqlite.prepare(`
    INSERT INTO settings (option, value, createdAt, updatedAt)
    VALUES (?, '1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(flag)
}

export function runLegacyUpgrades(sqlite: Database.Database) {
  backfillMediaNames(sqlite)
  upgradeImageMediaType(sqlite)
  copyVideoMetaAssignmentsToImage(sqlite)
  dedupeDefaultMediaTypes(sqlite)
  hideDefaultMetaChipsOnCards(sqlite)
  const renamed = renameDuplicateTagNames(sqlite)
  if (renamed > 0) {
    console.log('\x1b[33m%s\x1b[0m', `⚙️ Renamed ${renamed} duplicate tag name(s) for global uniqueness`)
  }
}

