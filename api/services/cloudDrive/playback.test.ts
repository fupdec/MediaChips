// @vitest-environment node
import fs from 'fs'
import os from 'os'
import path from 'path'
import express from 'express'
import type {Server} from 'http'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createTestDb, closeTestDb, type TestDb} from '../../db/testUtils/createTestDb'
import type {ApiDb} from '../../types/db'
import {createCloudDriveService, type CloudDriveService} from './index'
import {importDriveFile} from './library'
import registerDrive from '../../routes/CloudDrive.routes'

const state = vi.hoisted(() => ({service: undefined as CloudDriveService | undefined}))
vi.mock('./index', async original => ({...await original<typeof import('./index')>(), getCloudDriveService: () => state.service!}))
vi.mock('../mediaCacheInvalidation', () => ({invalidateMediaDerivedCaches: vi.fn()}))

describe('legacy Drive version-pinned playback', () => {
  let fixture: TestDb, db: ApiDb, directory: string, server: Server, base: string, mediaId: number
  beforeEach(async () => {
    fixture = createTestDb('drive-playback')
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-drive-playback-'))
    db = {...fixture, path: directory}
    fixture.sqlite.exec("INSERT INTO mediaTypes (id,type,name,createdAt,updatedAt) VALUES (1,'video','Videos','2026','2026')")
    state.service = createCloudDriveService({config: {clientId: '', clientSecret: '', redirectUri: '', configured: true,
      mock: true, scopes: [], tokenStorePath: path.join(directory, 'tokens.json')}})
    mediaId = (await importDriveFile(db, state.service, 'mock-video-sample')).id
    const app = express(); registerDrive(app, db)
    server = await new Promise((resolve, reject) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); listener.once('error', reject)
    })
    base = `http://127.0.0.1:${(server.address() as {port: number}).port}`
  })
  afterEach(async () => {
    server?.closeAllConnections()
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    closeTestDb(fixture); fs.rmSync(directory, {recursive: true, force: true}); vi.restoreAllMocks()
  })
  const plan = async () => {
    const response = await fetch(`${base}/api/drive/media/${mediaId}/playable`)
    expect(response.status).toBe(200)
    return (await response.json() as {url: string}).url
  }
  it('keeps ranges on the original version and rejects another resource or library', async () => {
    const url = await plan()
    const first = await fetch(base + url, {headers: {Range: 'bytes=0-3'}})
    expect(first.status).toBe(206); expect((await first.arrayBuffer()).byteLength).toBe(4)
    expect((await fetch(base + url.replace('mock-video-sample', 'another-file'))).status).toBe(410)
    db.path = `${directory}-other`
    expect((await fetch(base + url)).status).toBe(409)
    db.path = directory
    const get = state.service!.transport.getFileMeta.bind(state.service!.transport)
    vi.spyOn(state.service!.transport, 'getFileMeta').mockImplementation(async (...args) => ({...await get(...args), modifiedTime: '2030-01-01T00:00:00Z'}))
    expect((await fetch(base + url, {headers: {Range: 'bytes=4-7'}})).status).toBe(409)
    expect((await fetch(`${base}/api/drive/media/${mediaId}/playable`)).status).toBe(409)
  })
  it('invalidates an issued URL after logout', async () => {
    const url = await plan()
    expect((await fetch(`${base}/api/drive/oauth/logout`, {method: 'POST'})).status).toBe(200)
    expect((await fetch(base + url)).status).toBe(410)
  })
})
