import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { repairSchemaColumns, repairMissingTables, repairMissingIndexes } from './schemaRepair'

describe('schemaRepair', () => {
  let tempDir: string
  let dbPath: string
  let sqlite: Database.Database

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediachips-schema-repair-'))
    dbPath = path.join(tempDir, 'db.sqlite')
    sqlite = new Database(dbPath)
    sqlite.exec(`
      CREATE TABLE meta (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        type text,
        name text,
        createdAt text NOT NULL,
        updatedAt text NOT NULL
      );
    `)
  })

  afterEach(() => {
    sqlite?.close()
    fs.rmSync(tempDir, {recursive: true, force: true})
  })

  it('adds missing meta.views column for legacy databases', () => {
    const repaired = repairSchemaColumns(sqlite)

    expect(repaired).toContain('meta.views')
    const columns = sqlite.pragma('table_info(meta)') as Array<{name: string}>
    expect(columns.some((column) => column.name === 'views')).toBe(true)
  })

  it('adds missing meta.tagPageDesign column for legacy databases', () => {
    const repaired = repairSchemaColumns(sqlite)

    expect(repaired).toContain('meta.tagPageDesign')
    const columns = sqlite.pragma('table_info(meta)') as Array<{name: string}>
    const column = columns.find((entry) => entry.name === 'tagPageDesign')
    expect(column).toBeTruthy()
  })

  it('adds missing meta.synonyms column for legacy databases', () => {
    const repaired = repairSchemaColumns(sqlite)

    expect(repaired).toContain('meta.synonyms')
    const columns = sqlite.pragma('table_info(meta)') as Array<{name: string}>
    expect(columns.some((column) => column.name === 'synonyms')).toBe(true)
  })

  it('creates imageMetadata and migrates legacy pinnedMeta into pinnedMetas', () => {
    sqlite.exec(`
      CREATE TABLE pinnedMeta (
        scraper text,
        show integer DEFAULT 1,
        "order" integer,
        metaId integer,
        pinnedMetaId integer
      );
      INSERT INTO pinnedMeta (metaId, pinnedMetaId, scraper, show, "order")
      VALUES (1, 2, 'test', 1, 3);
    `)

    const repaired = repairMissingTables(sqlite)

    expect(repaired).toContain('imageMetadata')
    expect(repaired).toContain('pinnedMetas')
    expect(repaired).toContain('pinnedMeta→pinnedMetas')

    const pinnedRows = sqlite.prepare('SELECT metaId, pinnedMetaId, scraper FROM pinnedMetas').all()
    expect(pinnedRows).toEqual([{metaId: 1, pinnedMetaId: 2, scraper: 'test'}])
  })

  it('adds unique index on videoMetadata.mediaId for legacy databases', () => {
    sqlite.exec(`
      CREATE TABLE videoMetadata (
        duration INTEGER DEFAULT 0,
        codec TEXT,
        mediaId INTEGER
      );
      INSERT INTO videoMetadata (mediaId, codec) VALUES (1, 'h264'), (2, NULL);
    `)

    const repaired = repairMissingIndexes(sqlite)

    expect(repaired).toContain('video_metadata_media_id_idx')
    expect(repairMissingIndexes(sqlite)).toEqual([])

    const index = sqlite.prepare(
      `SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'video_metadata_media_id_idx'`,
    ).get() as {sql: string}
    expect(index.sql).toMatch(/UNIQUE/i)
  })

  it('adds missing filterRows.order column for legacy databases', () => {
    sqlite.exec(`
      CREATE TABLE filterRows (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        param text,
        createdAt text NOT NULL,
        updatedAt text NOT NULL
      );
    `)

    const repaired = repairSchemaColumns(sqlite)

    expect(repaired).toContain('filterRows.order')
    const columns = sqlite.pragma('table_info(filterRows)') as Array<{name: string}>
    expect(columns.some((column) => column.name === 'order')).toBe(true)
  })
})
