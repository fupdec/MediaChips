import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb, closeTestDb } from '../testUtils/createTestDb'
import { createSettingsRepository } from './settings'

describe('settings repository', () => {
  let sqlite: Database.Database
  let db: ReturnType<typeof createTestDb>['drizzle']
  let dbPath: string

  beforeEach(() => {
    const testDb = createTestDb('settings')
    sqlite = testDb.sqlite
    db = testDb.drizzle
    dbPath = testDb.dbPath
  })

  afterEach(() => {
    closeTestDb({sqlite, dbPath})
  })

  it('upserts and reads settings by option', () => {
    const repo = createSettingsRepository(db)

    expect(repo.findAll()).toEqual([])

    const created = repo.upsertByOption('theme', 'dark')
    expect(created.created).toBe(true)
    expect(repo.findByOption('theme')?.value).toBe('dark')

    const updated = repo.upsertByOption('theme', 'light')
    expect(updated.created).toBe(false)
    expect(repo.findByOption('theme')?.value).toBe('light')
  })

  it('loads settings by option list', () => {
    const repo = createSettingsRepository(db)
    repo.upsertByOption('pathParser.useML', '1')
    repo.upsertByOption('other', '0')

    const rows = repo.findByOptions(['pathParser.useML', 'missing'])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.option).toBe('pathParser.useML')
  })
})
