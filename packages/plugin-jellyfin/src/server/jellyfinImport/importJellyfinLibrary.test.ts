import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {bootstrapDatabase} from '../../../../../api/db/migrationRunner'
import {closeDrizzleClient, createDrizzleClient} from '../../../../../api/db/client'
import {createMediaRepository} from '../../../../../api/db/repositories/media'
import {createTagsRepository} from '../../../../../api/db/repositories/tags'
import {createMarksRepository} from '../../../../../api/db/repositories/marks'
import {createMetaRepository} from '../../../../../api/db/repositories/meta'
import {importJellyfinLibrary} from './importJellyfinLibrary'
import type {ApiDb} from '../../../../../api/types/db'
import type {JellyfinClient, JellyfinLibrarySnapshot} from './index'

function createSnapshot(): JellyfinLibrarySnapshot {
  return {
    people: [{id: 'p1', name: 'Alice'}],
    genres: [{id: 'g1', name: 'Action'}],
    studios: [{id: 's1', name: 'Studio X'}],
    series: [{id: 'show1', name: 'Cool Show'}],
    items: [{
      id: 'm1',
      name: 'Episode 1',
      path: '/videos/episode1.mp4',
      type: 'Episode',
      seriesId: 'show1',
      filesize: 12345,
      duration: 120,
      width: 1920,
      height: 1080,
      bitrate: 5_000_000,
      codec: 'h264',
      communityRating: 8,
      playCount: 2,
      lastPlayedDate: '2024-01-01T00:00:00.000Z',
      personIds: ['p1'],
      genreIds: ['g1'],
      studioIds: ['s1'],
      chapters: [{name: 'Intro', startSeconds: 10}],
    }],
  }
}

function createFakeClient(snapshot: JellyfinLibrarySnapshot): JellyfinClient {
  return {
    listLibraries: async () => [{id: 'lib1', name: 'Movies'}],
    loadLibrarySnapshot: async () => snapshot,
  }
}

describe('importJellyfinLibrary', () => {
  let tmpDir: string
  let connection: ReturnType<typeof createDrizzleClient>
  let db: ApiDb

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-jellyfin-import-'))
    const databasePath = path.join(tmpDir, 'mediachips.sqlite')
    await bootstrapDatabase(databasePath)
    connection = createDrizzleClient(databasePath)
    db = {
      path: tmpDir,
      drizzle: connection.drizzle,
      sqlite: connection.sqlite,
    }
  })

  afterEach(() => {
    closeDrizzleClient(connection)
    fs.rmSync(tmpDir, {recursive: true, force: true})
  })

  it('imports people, genres, studios, series, media, and chapters', async () => {
    const snapshot = createSnapshot()
    const result = await importJellyfinLibrary(
      db,
      {
        baseUrl: 'http://localhost:8096',
        apiKey: 'test-key',
        createMissingMedia: true,
      },
      undefined,
      undefined,
      () => createFakeClient(snapshot),
    )

    expect(result.ok).toBe(true)
    expect(result.people).toBe(1)
    expect(result.genres).toBe(1)
    expect(result.studios).toBe(1)
    expect(result.series).toBe(1)
    expect(result.mediaCreated).toBe(1)
    expect(result.markers).toBe(1)

    const metaRepo = createMetaRepository(connection.drizzle)
    const metas = metaRepo.findAll()
    expect(metas.some((row) => row.name === 'Series')).toBe(true)

    const tagsRepo = createTagsRepository(connection.drizzle, connection.sqlite)
    const tags = tagsRepo.findAllRaw()
    expect(tags.some((tag) => tag.oldId === 'jellyfin:person:p1')).toBe(true)
    expect(tags.some((tag) => tag.oldId === 'jellyfin:series:show1')).toBe(true)

    const mediaRepo = createMediaRepository(connection.drizzle)
    const media = mediaRepo.findByPathVariants(['/videos/episode1.mp4'])
    expect(media?.oldId).toBe('jellyfin:item:m1')
    expect(Number(media?.rating)).toBe(4)

    const marksRepo = createMarksRepository(connection.drizzle)
    const marks = marksRepo.findAllForVideo(media!.id)
    expect(marks).toHaveLength(1)
    expect(Number(marks[0].time)).toBe(10)
  })

  it('is idempotent on second import', async () => {
    const snapshot = createSnapshot()
    const factory = () => createFakeClient(snapshot)
    await importJellyfinLibrary(
      db,
      {baseUrl: 'http://localhost:8096', apiKey: 'test-key'},
      undefined,
      undefined,
      factory,
    )
    const second = await importJellyfinLibrary(
      db,
      {baseUrl: 'http://localhost:8096', apiKey: 'test-key'},
      undefined,
      undefined,
      factory,
    )
    expect(second.mediaCreated).toBe(0)
    expect(second.mediaMatched).toBe(1)
    expect(second.markers).toBe(0)
  })

  it('skips missing media when createMissingMedia is false', async () => {
    const snapshot = createSnapshot()
    const result = await importJellyfinLibrary(
      db,
      {
        baseUrl: 'http://localhost:8096',
        apiKey: 'test-key',
        createMissingMedia: false,
      },
      undefined,
      undefined,
      () => createFakeClient(snapshot),
    )
    expect(result.mediaCreated).toBe(0)
    expect(result.mediaSkipped).toBe(1)
  })
})
