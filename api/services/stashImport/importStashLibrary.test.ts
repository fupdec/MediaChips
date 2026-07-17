import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'
import {bootstrapDatabase} from '../../db/migrationRunner'
import {closeDrizzleClient, createDrizzleClient} from '../../db/client'
import {createMediaRepository} from '../../db/repositories/media'
import {createTagsRepository} from '../../db/repositories/tags'
import {createMarksRepository} from '../../db/repositories/marks'
import {createMetaRepository} from '../../db/repositories/meta'
import {importStashLibrary} from './importStashLibrary'
import type {ApiDb} from '../../types/db'

function createFixtureStashDb(filePath: string) {
  const db = new Database(filePath)
  db.exec(`
    CREATE TABLE performers (
      id INTEGER PRIMARY KEY,
      name TEXT,
      country TEXT,
      favorite INTEGER DEFAULT 0,
      rating INTEGER
    );
    CREATE TABLE performer_aliases (
      performer_id INTEGER NOT NULL,
      alias TEXT NOT NULL
    );
    CREATE TABLE studios (
      id INTEGER PRIMARY KEY,
      name TEXT,
      favorite INTEGER DEFAULT 0,
      rating INTEGER
    );
    CREATE TABLE studio_aliases (
      studio_id INTEGER NOT NULL,
      alias TEXT NOT NULL
    );
    CREATE TABLE tags (
      id INTEGER PRIMARY KEY,
      name TEXT,
      favorite INTEGER DEFAULT 0
    );
    CREATE TABLE tag_aliases (
      tag_id INTEGER NOT NULL,
      alias TEXT NOT NULL
    );
    CREATE TABLE scenes (
      id INTEGER PRIMARY KEY,
      title TEXT,
      rating INTEGER,
      studio_id INTEGER,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE folders (
      id INTEGER PRIMARY KEY,
      path TEXT NOT NULL,
      basename TEXT
    );
    CREATE TABLE files (
      id INTEGER PRIMARY KEY,
      basename TEXT NOT NULL,
      parent_folder_id INTEGER,
      size INTEGER
    );
    CREATE TABLE scenes_files (
      scene_id INTEGER NOT NULL,
      file_id INTEGER NOT NULL,
      "primary" INTEGER DEFAULT 0
    );
    CREATE TABLE video_files (
      file_id INTEGER PRIMARY KEY,
      duration REAL,
      width INTEGER,
      height INTEGER,
      bit_rate INTEGER,
      frame_rate REAL,
      video_codec TEXT
    );
    CREATE TABLE files_fingerprints (
      file_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      fingerprint TEXT NOT NULL
    );
    CREATE TABLE performers_scenes (
      performer_id INTEGER NOT NULL,
      scene_id INTEGER NOT NULL
    );
    CREATE TABLE scenes_tags (
      scene_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL
    );
    CREATE TABLE scene_markers (
      id INTEGER PRIMARY KEY,
      scene_id INTEGER NOT NULL,
      title TEXT,
      seconds REAL,
      end_seconds REAL,
      primary_tag_id INTEGER
    );
    CREATE TABLE scenes_view_dates (
      scene_id INTEGER NOT NULL,
      view_date TEXT
    );
  `)

  db.prepare(`INSERT INTO performers (id, name, country, favorite, rating) VALUES (1, 'Alice', 'US', 1, 80)`).run()
  db.prepare(`INSERT INTO performer_aliases (performer_id, alias) VALUES (1, 'Ally')`).run()
  db.prepare(`INSERT INTO studios (id, name, favorite, rating) VALUES (1, 'Studio X', 0, 60)`).run()
  db.prepare(`INSERT INTO tags (id, name, favorite) VALUES (1, 'Outdoor', 1)`).run()
  db.prepare(`INSERT INTO tag_aliases (tag_id, alias) VALUES (1, 'Outside')`).run()
  db.prepare(`INSERT INTO folders (id, path, basename) VALUES (1, '/videos', 'videos')`).run()
  db.prepare(`INSERT INTO files (id, basename, parent_folder_id, size) VALUES (1, 'scene1.mp4', 1, 12345)`).run()
  db.prepare(`
    INSERT INTO video_files (file_id, duration, width, height, bit_rate, frame_rate, video_codec)
    VALUES (1, 120.5, 1920, 1080, 5000000, 29.97, 'h264')
  `).run()
  db.prepare(`INSERT INTO files_fingerprints (file_id, type, fingerprint) VALUES (1, 'oshash', 'abc123oshash')`).run()
  db.prepare(`INSERT INTO files_fingerprints (file_id, type, fingerprint) VALUES (1, 'md5', 'md5hash')`).run()
  db.prepare(`
    INSERT INTO scenes (id, title, rating, studio_id, created_at, updated_at)
    VALUES (1, 'First Scene', 100, 1, '2020-01-01', '2020-01-02')
  `).run()
  db.prepare(`INSERT INTO scenes_files (scene_id, file_id, "primary") VALUES (1, 1, 1)`).run()
  db.prepare(`INSERT INTO performers_scenes (performer_id, scene_id) VALUES (1, 1)`).run()
  db.prepare(`INSERT INTO scenes_tags (scene_id, tag_id) VALUES (1, 1)`).run()
  db.prepare(`
    INSERT INTO scene_markers (id, scene_id, title, seconds, end_seconds, primary_tag_id)
    VALUES (1, 1, 'Intro', 12.2, 20.0, 1)
  `).run()
  db.prepare(`INSERT INTO scenes_view_dates (scene_id, view_date) VALUES (1, '2021-05-01T12:00:00Z')`).run()
  db.prepare(`INSERT INTO scenes_view_dates (scene_id, view_date) VALUES (1, '2021-06-01T12:00:00Z')`).run()
  db.close()
}

describe('importStashLibrary', () => {
  let tmpDir: string
  let stashDbPath: string
  let connection: ReturnType<typeof createDrizzleClient>
  let apiDb: ApiDb

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-stash-import-'))
    stashDbPath = path.join(tmpDir, 'stash-go.sqlite')
    createFixtureStashDb(stashDbPath)

    const mcDbPath = path.join(tmpDir, 'mc.sqlite')
    await bootstrapDatabase(mcDbPath)
    connection = createDrizzleClient(mcDbPath)
    apiDb = {
      path: tmpDir,
      drizzle: connection.drizzle,
      sqlite: connection.sqlite,
    }
  })

  afterEach(() => {
    closeDrizzleClient(connection)
    fs.rmSync(tmpDir, {recursive: true, force: true})
  })

  it('imports performers, studios, tags, media, links and markers', async () => {
    const result = await importStashLibrary(apiDb, stashDbPath, {createMissingMedia: true})

    expect(result.ok).toBe(true)
    expect(result.performers).toBe(1)
    expect(result.studios).toBe(1)
    expect(result.tags).toBe(1)
    expect(result.mediaCreated).toBe(1)
    expect(result.markers).toBe(1)
    expect(result.errors).toEqual([])

    const mediaRepo = createMediaRepository(connection.drizzle)
    const media = mediaRepo.findByOshash('abc123oshash')
    expect(media).toBeTruthy()
    expect(media?.name).toBe('First Scene')
    expect(media?.rating).toBe(5)
    expect(media?.views).toBe(2)
    expect(media?.path).toContain('scene1.mp4')

    const tagsRepo = createTagsRepository(connection.drizzle, connection.sqlite)
    const tags = tagsRepo.findAllRaw()
    const alice = tags.find((tag) => tag.name === 'Alice')
    expect(alice?.synonyms).toBe('Ally')
    expect(alice?.oldId).toBe('stash:performer:1')
    expect(alice?.favorite).toBe(true)

    const metaRepo = createMetaRepository(connection.drizzle)
    const metas = metaRepo.findAll()
    expect(metas.some((meta) => meta.name === 'Performers')).toBe(true)
    expect(metas.some((meta) => meta.name === 'Studios')).toBe(true)
    expect(metas.some((meta) => meta.name === 'Tags')).toBe(true)

    const marksRepo = createMarksRepository(connection.drizzle)
    const marks = marksRepo.findAllForVideo(media!.id)
    expect(marks).toHaveLength(1)
    expect(marks[0].time).toBe(12)
    expect(marks[0].text).toBe('Intro')
  })

  it('is idempotent on second import', async () => {
    await importStashLibrary(apiDb, stashDbPath, {createMissingMedia: true})
    const second = await importStashLibrary(apiDb, stashDbPath, {createMissingMedia: true})

    expect(second.mediaCreated).toBe(0)
    expect(second.mediaMatched).toBe(1)

    const mediaRepo = createMediaRepository(connection.drizzle)
    expect(mediaRepo.findAllRaw()).toHaveLength(1)

    const tagsRepo = createTagsRepository(connection.drizzle, connection.sqlite)
    const performers = tagsRepo.findAllRaw().filter((tag) => tag.oldId?.startsWith('stash:performer:'))
    expect(performers).toHaveLength(1)

    const marksRepo = createMarksRepository(connection.drizzle)
    const media = mediaRepo.findAllRaw()[0]
    expect(marksRepo.findAllForVideo(media.id)).toHaveLength(1)
  })

  it('skips creating media when createMissingMedia is false', async () => {
    const result = await importStashLibrary(apiDb, stashDbPath, {createMissingMedia: false})
    expect(result.mediaCreated).toBe(0)
    expect(result.mediaSkipped).toBe(1)

    const mediaRepo = createMediaRepository(connection.drizzle)
    expect(mediaRepo.findAllRaw()).toHaveLength(0)
  })
})
