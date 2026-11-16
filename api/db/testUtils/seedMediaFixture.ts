/**
 * Thin media rows for scale / profiling (10k / 50k / 100k).
 * DB-only by default; optional on-disk tiny JPEGs for import/watcher walks.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'
import {drizzle} from 'drizzle-orm/better-sqlite3'
import {applySqlitePragmas} from '../pragmas'
import {runDrizzleMigrations} from '../drizzleMigrations'
import {repairSchemaColumns, repairMissingTables, repairMissingIndexes} from '../schemaRepair'
import * as schema from '../schema'
import {MEDIA_NOT_IN_TRASH_SQL} from '../../../shared/mediaTrash'
import type {TestDb} from './createTestDb'

export const MEDIA_FIXTURE_COUNTS = [10_000, 50_000, 100_000] as const
export type MediaFixtureCount = (typeof MEDIA_FIXTURE_COUNTS)[number]

const TINY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9])

export type SeedMediaFixtureOptions = {
  count: number
  /** Persist to this path (created/migrated). Defaults to a temp file. */
  dbPath?: string
  /** Write real tiny JPEGs under this dir (or a temp dir) and use those paths. */
  withFiles?: boolean
  /** Root for --with-files; created when missing. */
  filesDir?: string
  /** Synthetic path prefix when not using real files. */
  pathPrefix?: string
}

export type SeedMediaFixtureResult = TestDb & {
  mediaTypeId: number
  count: number
  filesDir: string | null
  seedMs: number
}

export type ListPageTiming = {
  page: number
  limit: number
  offset: number
  rowCount: number
  ms: number
}

function openFixtureDb(dbPath: string): TestDb {
  runDrizzleMigrations(dbPath)
  const sqlite = new Database(dbPath)
  applySqlitePragmas(sqlite)
  repairSchemaColumns(sqlite)
  repairMissingTables(sqlite)
  repairMissingIndexes(sqlite)
  return {
    sqlite,
    drizzle: drizzle(sqlite, {schema}),
    dbPath,
  }
}

function ensureMediaType(sqlite: Database.Database): number {
  const existing = sqlite.prepare(`
    SELECT id FROM mediaTypes WHERE type = 'image' ORDER BY id ASC LIMIT 1
  `).get() as {id: number} | undefined
  if (existing?.id) return Number(existing.id)

  const now = new Date().toISOString()
  const result = sqlite.prepare(`
    INSERT INTO mediaTypes (type, name, icon, extensions, "order", createdAt, updatedAt)
    VALUES ('image', 'Images', 'image', 'jpg,jpeg,png', 1, ?, ?)
  `).run(now, now)
  return Number(result.lastInsertRowid)
}

/**
 * Inserts `count` thin media rows in one transaction.
 * Re-running on a non-empty DB of the same size is a no-op (idempotent by path).
 */
export function seedMediaFixture(options: SeedMediaFixtureOptions): SeedMediaFixtureResult {
  const count = Math.max(0, Math.floor(options.count))
  const dbPath = options.dbPath || path.join(
    os.tmpdir(),
    `mediachips-media-fixture-${count}-${Date.now()}.sqlite`,
  )
  if (options.dbPath && fs.existsSync(dbPath)) {
    fs.rmSync(dbPath, {force: true})
  }

  const db = openFixtureDb(dbPath)
  const mediaTypeId = ensureMediaType(db.sqlite)

  let filesDir: string | null = null
  if (options.withFiles) {
    filesDir = options.filesDir || path.join(
      os.tmpdir(),
      `mediachips-media-fixture-files-${count}-${Date.now()}`,
    )
    fs.mkdirSync(filesDir, {recursive: true})
  }

  const pathPrefix = options.pathPrefix || '/fixture/media'
  const now = new Date().toISOString()
  const rows: Array<{path: string; basename: string; name: string}> = []
  for (let i = 0; i < count; i += 1) {
    const stem = `img-${String(i).padStart(6, '0')}`
    const basename = `${stem}.jpg`
    if (filesDir) {
      const filePath = path.join(filesDir, basename)
      fs.writeFileSync(filePath, TINY_JPEG)
      rows.push({path: filePath, basename, name: stem})
    } else {
      rows.push({path: `${pathPrefix}/${basename}`, basename, name: stem})
    }
  }

  const insert = db.sqlite.prepare(`
    INSERT OR IGNORE INTO media (
      path, basename, name, ext, filesize, mediaTypeId,
      rating, favorite, views, createdAt, updatedAt, mediaCreatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?)
  `)
  const filesize = filesDir ? TINY_JPEG.length : 1024

  const t0 = Date.now()
  const tx = db.sqlite.transaction(() => {
    for (const row of rows) {
      insert.run(
        row.path,
        row.basename,
        row.name,
        'jpg',
        filesize,
        mediaTypeId,
        now,
        now,
        now,
      )
    }
  })
  tx()
  const seedMs = Date.now() - t0

  const actual = Number(
    (db.sqlite.prepare('SELECT COUNT(*) AS n FROM media WHERE mediaTypeId = ?').get(mediaTypeId) as {n: number}).n,
  )

  return {
    ...db,
    mediaTypeId,
    count: actual,
    filesDir,
    seedMs,
  }
}

/** Time a default id-DESC list page (hot path for infinite scroll). */
export function timeMediaListPage(
  sqlite: Database.Database,
  mediaTypeId: number,
  page: number,
  limit: number,
): ListPageTiming {
  const safePage = Math.max(1, Math.floor(page) || 1)
  const safeLimit = Math.max(1, Math.floor(limit) || 60)
  const offset = (safePage - 1) * safeLimit
  const sql = `
    SELECT media.id
    FROM media
    WHERE media.mediaTypeId = ?
      AND ${MEDIA_NOT_IN_TRASH_SQL}
    ORDER BY media.id DESC
    LIMIT ? OFFSET ?
  `
  const stmt = sqlite.prepare(sql)
  const t0 = Date.now()
  const rows = stmt.all(mediaTypeId, safeLimit, offset) as Array<{id: number}>
  return {
    page: safePage,
    limit: safeLimit,
    offset,
    rowCount: rows.length,
    ms: Date.now() - t0,
  }
}

export function explainMediaListPage(
  sqlite: Database.Database,
  mediaTypeId: number,
  limit = 60,
  offset = 0,
): string {
  const rows = sqlite.prepare(`
    EXPLAIN QUERY PLAN
    SELECT media.id
    FROM media
    WHERE media.mediaTypeId = ${Number(mediaTypeId)}
      AND ${MEDIA_NOT_IN_TRASH_SQL}
    ORDER BY media.id DESC
    LIMIT ${Number(limit)} OFFSET ${Number(offset)}
  `).all() as Array<{detail?: string}>
  return rows.map((row) => String(row.detail || '')).join('\n')
}

export function hasBareTableScan(plan: string, table: string): boolean {
  const re = new RegExp(`\\bSCAN\\s+(?:TABLE\\s+)?${table}\\b(?!\\s+USING\\s+INDEX)`, 'i')
  return re.test(plan)
}
