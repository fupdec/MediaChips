/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { createTestDb, closeTestDb } from '../testUtils/createTestDb'
import { createWatchedFoldersRepository } from './watchedFolders'
import { createMediaTypesRepository } from './mediaTypes'
import { createMediaTypesInWatchedFoldersRepository } from './mediaTypesInWatchedFolders'
import { mediaTypesInWatchedFolders } from '../schema/watchedFolders'

describe('watchedFolders repository', () => {
  let sqlite: Database.Database
  let db: ReturnType<typeof createTestDb>['drizzle']
  let dbPath: string

  beforeEach(() => {
    const testDb = createTestDb('watched-folders')
    sqlite = testDb.sqlite
    db = testDb.drizzle
    dbPath = testDb.dbPath
  })

  afterEach(() => {
    closeTestDb({sqlite, dbPath})
  })

  it('deletes mediaTypesInWatchedFolders rows with the folder', () => {
    const foldersRepo = createWatchedFoldersRepository(db)
    const typesRepo = createMediaTypesRepository(db)
    const video = typesRepo.create({name: 'Videos', type: 'video'})
    const keep = typesRepo.create({name: 'Images', type: 'image'})

    const removed = foldersRepo.findOrCreateByPath('C:\\Videos', 'Videos').folder
    const kept = foldersRepo.findOrCreateByPath('C:\\Photos', 'Photos').folder
    foldersRepo.replaceMediaTypes(removed.id, [video.id])
    foldersRepo.replaceMediaTypes(kept.id, [keep.id])

    foldersRepo.deleteById(removed.id)

    const remaining = db.select().from(mediaTypesInWatchedFolders).all()
    expect(remaining).toEqual([{folderId: kept.id, mediaTypeId: keep.id}])
  })
})

describe('mediaTypesInWatchedFolders repository', () => {
  let sqlite: Database.Database
  let db: ReturnType<typeof createTestDb>['drizzle']
  let dbPath: string

  beforeEach(() => {
    const testDb = createTestDb('watched-folder-links')
    sqlite = testDb.sqlite
    db = testDb.drizzle
    dbPath = testDb.dbPath
  })

  afterEach(() => {
    closeTestDb({sqlite, dbPath})
  })

  it('omits links whose watched folder no longer exists', () => {
    const foldersRepo = createWatchedFoldersRepository(db)
    const typesRepo = createMediaTypesRepository(db)
    const linksRepo = createMediaTypesInWatchedFoldersRepository(db)
    const video = typesRepo.create({name: 'Videos', type: 'video'})
    const folder = foldersRepo.findOrCreateByPath('/media', 'Media').folder
    foldersRepo.replaceMediaTypes(folder.id, [video.id])

    db.insert(mediaTypesInWatchedFolders).values({folderId: 999, mediaTypeId: video.id}).run()

    const rows = linksRepo.findAllWithRelations()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.folderId).toBe(folder.id)
    expect(rows[0]?.watchedFolder.path).toBe('/media')
  })
})

describe('mediaTypes repository watched-folder links', () => {
  let sqlite: Database.Database
  let db: ReturnType<typeof createTestDb>['drizzle']
  let dbPath: string

  beforeEach(() => {
    const testDb = createTestDb('media-types-watched')
    sqlite = testDb.sqlite
    db = testDb.drizzle
    dbPath = testDb.dbPath
  })

  afterEach(() => {
    closeTestDb({sqlite, dbPath})
  })

  it('deletes mediaTypesInWatchedFolders rows with the media type', () => {
    const foldersRepo = createWatchedFoldersRepository(db)
    const typesRepo = createMediaTypesRepository(db)
    const video = typesRepo.create({name: 'Videos', type: 'video'})
    const folder = foldersRepo.findOrCreateByPath('/media', 'Media').folder
    foldersRepo.replaceMediaTypes(folder.id, [video.id])

    typesRepo.deleteById(video.id)

    expect(
      db.select().from(mediaTypesInWatchedFolders).where(eq(mediaTypesInWatchedFolders.folderId, folder.id)).all(),
    ).toEqual([])
  })
})
