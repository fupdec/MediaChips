import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {bootstrapDatabase} from '../../../../../api/db/migrationRunner'
import {closeDrizzleClient, createDrizzleClient} from '../../../../../api/db/client'
import {createMediaRepository} from '../../../../../api/db/repositories/media'
import {createMarksRepository} from '../../../../../api/db/repositories/marks'
import {importPlexLibrary} from './importPlexLibrary'
import type {ApiDb} from '../../../../../api/types/db'
import type {PlexLibrarySnapshot} from './types'

const snapshot: PlexLibrarySnapshot = {
  people: [{id: 'actor-1', name: 'Alice'}],
  genres: [{id: 'genre-1', name: 'Drama'}],
  studios: [{id: 'name:Studio X', name: 'Studio X'}],
  series: [{id: 'show-1', name: 'A Show'}],
  items: [{
    id: 'movie-1', name: 'Episode one', path: '/media/episode-one.mp4', type: 'episode',
    seriesId: 'show-1', filesize: 42, duration: 120, width: null, height: null, bitrate: null,
    codec: null, rating: 8, playCount: 2, lastPlayedDate: '2024-01-01T00:00:00.000Z',
    personIds: ['actor-1'], genreIds: ['genre-1'],
    studioIds: ['name:Studio X'], chapters: [{name: 'Intro', startSeconds: 12}],
  }],
}

describe('importPlexLibrary', () => {
  let tmpDir: string
  let connection: ReturnType<typeof createDrizzleClient>
  let db: ApiDb
  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-plex-import-'))
    const databasePath = path.join(tmpDir, 'mediachips.sqlite')
    await bootstrapDatabase(databasePath)
    connection = createDrizzleClient(databasePath)
    db = {path: tmpDir, drizzle: connection.drizzle, sqlite: connection.sqlite}
  })
  afterEach(() => {
    closeDrizzleClient(connection)
    fs.rmSync(tmpDir, {recursive: true, force: true})
  })

  it('imports an injected Plex snapshot and is idempotent', async () => {
    const clientFactory = () => ({listLibraries: async () => [], loadLibrarySnapshot: async () => snapshot})
    const first = await importPlexLibrary(db, {baseUrl: 'http://plex', token: 'token'}, undefined, undefined, clientFactory)
    const second = await importPlexLibrary(db, {baseUrl: 'http://plex', token: 'token'}, undefined, undefined, clientFactory)
    expect(first.mediaCreated).toBe(1)
    expect(first.markers).toBe(1)
    expect(second.mediaCreated).toBe(0)
    const media = createMediaRepository(connection.drizzle).findAllRaw()
    expect(media).toHaveLength(1)
    expect(media[0].oldId).toBe('plex:item:movie-1')
    expect(createMarksRepository(connection.drizzle).findAllForVideo(media[0].id)).toHaveLength(1)
  })
})
