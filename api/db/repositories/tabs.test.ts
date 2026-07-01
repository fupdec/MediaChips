import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { applySqlitePragmas } from '../pragmas'
import { createTabsRepository } from './tabs'
import * as schema from '../schema'

function createTestDb() {
  const sqlite = new Database(':memory:')
  applySqlitePragmas(sqlite)
  sqlite.exec(`
    CREATE TABLE tabs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      icon TEXT,
      url TEXT,
      "order" INTEGER DEFAULT 0,
      metaId INTEGER,
      mediaTypeId INTEGER,
      tagId INTEGER,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `)
  return {
    sqlite,
    drizzle: drizzle(sqlite, {schema}),
  }
}

describe('tabs repository', () => {
  let sqlite: Database.Database
  let db: ReturnType<typeof createTestDb>['drizzle']

  beforeEach(() => {
    const testDb = createTestDb()
    sqlite = testDb.sqlite
    db = testDb.drizzle
  })

  afterEach(() => {
    sqlite.close()
  })

  it('creates, updates and deletes tabs', () => {
    const repo = createTabsRepository(db)
    const created = repo.create({name: 'Videos', icon: 'video', order: 1})
    expect(created.name).toBe('Videos')

    repo.updateById(created.id, {name: 'All videos'})
    expect(repo.findAll()[0]?.name).toBe('All videos')

    repo.deleteById(created.id)
    expect(repo.findAll()).toEqual([])
  })

  it('inserts new tab at the beginning by default', () => {
    const repo = createTabsRepository(db)
    const first = repo.create({name: 'First'})
    const second = repo.create({name: 'Second'})

    expect(first.order).toBe(0)
    expect(second.order).toBe(0)
    expect(repo.findAll().find((tab) => tab.id === first.id)?.order).toBe(1)
    expect(repo.findAll().find((tab) => tab.id === second.id)?.order).toBe(0)
  })
})
