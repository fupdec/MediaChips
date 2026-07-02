import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { repairSchemaColumns, repairMissingTables } from './schemaRepair'

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
})
