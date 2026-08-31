import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb, closeTestDb } from '../testUtils/createTestDb'
import { createTabsRepository } from './tabs'

describe('tabs repository', () => {
  let sqlite: Database.Database
  let db: ReturnType<typeof createTestDb>['drizzle']
  let dbPath: string

  beforeEach(() => {
    const testDb = createTestDb('tabs')
    sqlite = testDb.sqlite
    db = testDb.drizzle
    dbPath = testDb.dbPath
  })

  afterEach(() => {
    closeTestDb({sqlite, dbPath})
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

  it('appends new tab at the end by default', () => {
    const repo = createTabsRepository(db)
    const first = repo.create({name: 'First'})
    const second = repo.create({name: 'Second'})

    expect(first.order).toBe(0)
    expect(second.order).toBe(1)
    expect(repo.findAll().find((tab) => tab.id === first.id)?.order).toBe(0)
    expect(repo.findAll().find((tab) => tab.id === second.id)?.order).toBe(1)
  })
})
