/**
 * @vitest-environment node
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, describe, expect, it, vi} from 'vitest'
import Database from 'better-sqlite3'
import {chooseFavoriteSamplePivot, getFavoriteMedia} from './homeMedia'
import type {ApiDb} from '../types/db'

function createFavoriteDb() {
  const dbPath = path.join(
    os.tmpdir(),
    `mediachips-home-fav-${Date.now()}-${Math.random()}.sqlite`,
  )
  const sqlite = new Database(dbPath)
  sqlite.exec(`
    CREATE TABLE media (
      id INTEGER PRIMARY KEY,
      path TEXT NOT NULL,
      name TEXT,
      basename TEXT,
      ext TEXT,
      mediaTypeId INTEGER,
      filesize INTEGER,
      rating INTEGER,
      favorite INTEGER,
      views INTEGER,
      viewedAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE videoMetadata (
      mediaId INTEGER PRIMARY KEY,
      duration REAL,
      time REAL,
      width INTEGER,
      height INTEGER
    );
    CREATE TABLE imageMetadata (
      mediaId INTEGER PRIMARY KEY,
      width INTEGER,
      height INTEGER
    );
    CREATE INDEX media_favorite_id_idx ON media (favorite, id);
  `)

  const now = '2024-01-01T00:00:00.000Z'
  const insert = sqlite.prepare(`
    INSERT INTO media (id, path, name, basename, ext, favorite, views, createdAt, updatedAt)
    VALUES (@id, @path, @name, @basename, 'mp4', @favorite, 0, '${now}', '${now}')
  `)

  for (let id = 1; id <= 10; id += 1) {
    insert.run({
      id,
      path: `/v/${id}.mp4`,
      name: `Video ${id}`,
      basename: `${id}.mp4`,
      favorite: id % 2 === 0 ? 1 : 0,
    })
  }

  return {
    dbPath,
    sqlite,
    db: {sqlite, drizzle: {}, path: dbPath} as ApiDb,
  }
}

describe('chooseFavoriteSamplePivot', () => {
  it('picks within inclusive bounds', () => {
    expect(chooseFavoriteSamplePivot(2, 10, () => 0)).toBe(2)
    expect(chooseFavoriteSamplePivot(2, 10, () => 0.999)).toBe(10)
  })
})

describe('getFavoriteMedia', () => {
  let dbPath = ''
  let sqlite: Database.Database | null = null

  afterEach(() => {
    sqlite?.close()
    if (dbPath) fs.rmSync(dbPath, {force: true})
    sqlite = null
    dbPath = ''
    vi.restoreAllMocks()
  })

  it('returns empty when there are no favorites', async () => {
    const created = createFavoriteDb()
    dbPath = created.dbPath
    sqlite = created.sqlite
    sqlite.exec('UPDATE media SET favorite = 0')

    await expect(getFavoriteMedia(created.db, 5)).resolves.toEqual([])
  })

  it('samples from a pivot and wraps around without duplicates', async () => {
    const created = createFavoriteDb()
    dbPath = created.dbPath
    sqlite = created.sqlite
    // Favorites are ids 2,4,6,8,10. Pivot 7 → >=7: 8,10 then wrap 2.
    vi.spyOn(Math, 'random').mockReturnValue((7 - 2) / (10 - 2 + 1))

    const rows = await getFavoriteMedia(created.db, 3)
    expect(rows.map((row) => row.id)).toEqual([8, 10, 2])
    expect(rows.every((row) => row.favorite === 1 || row.favorite === true)).toBe(true)
  })

  it('returns all favorites when fewer than the limit', async () => {
    const created = createFavoriteDb()
    dbPath = created.dbPath
    sqlite = created.sqlite
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const rows = await getFavoriteMedia(created.db, 20)
    expect(rows.map((row) => row.id)).toEqual([2, 4, 6, 8, 10])
  })
})
