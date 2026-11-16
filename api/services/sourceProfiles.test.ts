// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import axios, {type InternalAxiosRequestConfig} from 'axios'
import {expect, it, vi} from 'vitest'
import createPlexController from '../plugins/plex/ImportFromPlex.controller'
import createJellyfinController from '../plugins/jellyfin/ImportFromJellyfin.controller'
import createEmbyController from '../plugins/emby/ImportFromEmby.controller'
import type {ApiRequest, ApiResponse} from '../types/http'
import {createSettingsRepository} from '../db/repositories/settings'
import {createDrizzleClient} from '../db/client'
import {createTestDb, closeTestDb} from '../db/testUtils/createTestDb'
import {createCloudAccounts} from './cloudAccounts/accounts'
import {createLibraryBackup, replaceLibraryFromStage, stageLibraryBackup} from './libraryBackup'
import {createMediaServerProfiles} from './mediaServerProfiles'
import {createNasCredentialStore} from './nas/credentials'
import {createNasService} from './nas/service'
import {installSourceProfiles} from './sourceProfiles'

it('preserves profile IDs, library bindings and working credentials when restoring a pre-profile backup', async () => {
  const fixture = createTestDb('source-profiles')
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-source-profiles-'))
  const library = path.join(home, 'library')
  const otherLibrary = path.join(home, 'other')
  fs.mkdirSync(library)
  fs.mkdirSync(otherLibrary)
  const file = path.join(library, 'db.sqlite')
  const otherFile = path.join(otherLibrary, 'db.sqlite')
  await fixture.sqlite.backup(file)
  await fixture.sqlite.backup(otherFile)
  let db = createDrizzleClient(file)
  const other = createDrizzleClient(otherFile)
  const connect = vi.fn(async (_config: unknown, _credentials: unknown) => ({
    async list() { return [] },
    async stat() { return {size: 1, modifiedAt: 1, isDirectory: false} },
    async read() { throw new Error('Unexpected read') },
    close() {},
  }))
  const nas = createNasService({connect, credentials: createNasCredentialStore(path.join(home, 'nas-vault'))})
  const cloud = createCloudAccounts(path.join(home, 'cloud-vault'))
  const archive = path.join(library, 'before-profiles.zip')
  const axiosAdapter = axios.defaults.adapter

  try {
    const oldNas = await nas.saveConnection(db, {
      name: 'Original NAS', protocol: 'webdav', host: 'nas.example', port: 443,
      username: 'user', root: '/movies', password: 'nas-test-password',
    })
    const settings = createSettingsRepository(db.drizzle)
    settings.upsertByOption('jellyfinBaseUrl', 'https://jellyfin.example')
    settings.upsertByOption('jellyfinApiKey', 'old-jellyfin-key')
    await createLibraryBackup(db.sqlite, library, archive)

    installSourceProfiles(db.sqlite, home, 'library')
    const secondNas = await nas.saveConnection(db, {
      name: 'Second NAS', protocol: 'webdav', host: 'nas2.example', port: 443,
      username: 'user', root: '/movies', password: 'second-test-password',
    })
    const account = cloud.create(db, {
      provider: 'onedrive', name: 'OneDrive', clientId: 'application',
      redirectUri: 'http://localhost:12321/api/cloud-accounts/oauth/callback',
    })
    vi.spyOn(axios, 'post').mockResolvedValue({data: {access_token: 'cloud-test-token', expires_in: 3600}})
    await cloud.callback(cloud.start(db, account.id).state, 'code')
    createMediaServerProfiles(db.sqlite, home, 'library', 'plex').save('https://plex.example', 'plex-test-token')
    createMediaServerProfiles(db.sqlite, home, 'library', 'emby').save('https://emby.example', 'emby-test-token')
    const jellyfin = createMediaServerProfiles(db.sqlite, home, 'library', 'jellyfin')
    const [{id: jellyfinId}] = jellyfin.list()
    jellyfin.save('https://jellyfin.example', 'current-jellyfin-key')

    const stage = await stageLibraryBackup(archive, library)
    await replaceLibraryFromStage(library, stage, {
      close() { db.sqlite.close() },
      async reload() {
        db = createDrizzleClient(file)
        installSourceProfiles(db.sqlite, home, 'library')
      },
    })

    expect(nas.connections(db)).toEqual(expect.arrayContaining([
      expect.objectContaining({id: oldNas.id, hasCredentials: true}),
      expect.objectContaining({id: secondNas.id, hasCredentials: true}),
    ]))
    await nas.list(db, secondNas.id, '')
    expect(connect.mock.lastCall?.[1]).toMatchObject({password: 'second-test-password'})
    expect(cloud.list(db)).toMatchObject([{id: account.id, authenticated: true}])
    const requestCloud = vi.fn(async (config: InternalAxiosRequestConfig) => ({data: {value: []}, status: 200, statusText: 'OK', headers: {}, config}))
    axios.defaults.adapter = requestCloud
    const cloudAdapter = cloud.adapter(db, account.id)
    try { await cloudAdapter.list('root') } finally { cloudAdapter.close() }
    expect(requestCloud.mock.lastCall?.[0].headers.Authorization).toBe('Bearer cloud-test-token')
    expect(db.sqlite.prepare('SELECT id FROM sourceConnections ORDER BY id').pluck().all())
      .toEqual([oldNas.id, secondNas.id, account.id].sort())
    const restoredJellyfin = createMediaServerProfiles(db.sqlite, home, 'library', 'jellyfin')
    expect(restoredJellyfin.list()).toEqual([{id: jellyfinId, baseUrl: 'https://jellyfin.example', selected: 1}])
    expect(restoredJellyfin.credential('https://jellyfin.example')).toBe('current-jellyfin-key')
    expect(createMediaServerProfiles(db.sqlite, home, 'library', 'plex').credential('https://plex.example')).toBe('plex-test-token')
    expect(createMediaServerProfiles(db.sqlite, home, 'library', 'emby').credential('https://emby.example')).toBe('emby-test-token')
    const serverDb = {...db, path_databases: home, config: {id: 'library'}}
    const requestServer = vi.fn(async (_url: string, _options: RequestInit) => Response.json([]))
    vi.stubGlobal('fetch', requestServer)
    for (const [controller, body, header, credential] of [
      [createPlexController(serverDb), {baseUrl: 'https://plex.example', token: ''}, 'X-Plex-Token', 'plex-test-token'],
      [createJellyfinController(serverDb), {baseUrl: 'https://jellyfin.example', apiKey: ''}, 'X-Emby-Token', 'current-jellyfin-key'],
      [createEmbyController(serverDb), {baseUrl: 'https://emby.example', apiKey: ''}, 'X-Emby-Token', 'emby-test-token'],
    ] as const) {
      const response = {json: vi.fn(), status: vi.fn().mockReturnThis()}
      await controller.listLibraries({body} as ApiRequest, response as unknown as ApiResponse)
      expect(response.json).toHaveBeenCalledWith({ok: true, libraries: []})
      expect(new Headers(requestServer.mock.lastCall?.[1].headers).get(header)).toBe(credential)
    }
    expect(db.sqlite.prepare("SELECT value FROM settings WHERE option = 'jellyfinApiKey'").get()).toBeUndefined()

    installSourceProfiles(other.sqlite, home, 'other')
    expect(nas.connections(other).map(profile => profile.id)).toContain(secondNas.id)
    expect(other.sqlite.prepare('SELECT id FROM sourceConnections').all()).toEqual([])
    await nas.list(other, secondNas.id, '')
    expect(other.sqlite.prepare('SELECT id FROM sourceConnections').pluck().all()).toEqual([secondNas.id])
    expect(createMediaServerProfiles(other.sqlite, home, 'other', 'plex').list()).toMatchObject([{selected: 0}])
  } finally {
    axios.defaults.adapter = axiosAdapter
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    if (db.sqlite.open) db.sqlite.close()
    other.sqlite.close()
    closeTestDb(fixture)
    fs.rmSync(home, {recursive: true, force: true})
  }
})
