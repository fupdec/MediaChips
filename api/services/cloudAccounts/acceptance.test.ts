// @vitest-environment node
import fs from 'fs'
import path from 'path'
import os from 'os'
import express from 'express'
import type {Server} from 'http'
import axios from 'axios'
import {afterEach, beforeEach, describe, it, expect, vi} from 'vitest'
import {createTestDb, closeTestDb, type TestDb} from '../../db/testUtils/createTestDb'
import type {ApiDb} from '../../types/db'
import {createCloudAccounts} from './accounts'
import {fixtureRequest} from './testFixtures'
import {importCloudFile} from './library'
import {createMediaRepository} from '../../db/repositories/media'
import {createMediaTypesRepository} from '../../db/repositories/mediaTypes'
import {createVideoMetadataRepository} from '../../db/repositories/videoMetadata'
import {parseCloudMediaPath} from '../../../shared/cloudAccounts'
import {isRemoteMediaPath} from '../../../shared/remoteMedia'
import {resolveMediaLocation} from '../mediaSources/locations'
import {copyCandidates} from '../mediaSources/copies'
import {listCatalogSources, CATALOG_SOURCE_TOKENS_SQL} from '../mediaCatalogSources'
import registerCloudAccounts from '../../routes/CloudAccounts.routes'

const state = vi.hoisted(() => ({manager: null as any, request: null as any}))
vi.mock('./accounts', async original => ({...await original<typeof import('./accounts')>(), getCloudAccounts: () => state.manager}))
vi.mock('./providers', async original => {
  const actual = await original<typeof import('./providers')>()
  return {...actual, createCloudAdapter: (provider: any, token: any) => actual.createCloudAdapter(provider, token, state.request)}
})
vi.mock('../mediaCacheInvalidation', () => ({invalidateMediaDerivedCaches: vi.fn()}))
describe.each(['gdrive', 'onedrive', 'dropbox'] as const)('%s shared acceptance scenario', provider => {
  let fixture: TestDb, db: ApiDb, directory: string, server: Server, origin: string
  let transport: ReturnType<typeof fixtureRequest>
  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-accounts-'))
    fixture = createTestDb('accounts'); db = {...fixture, path: directory}
    createMediaTypesRepository(db.drizzle).create({name: 'video', type: 'video'})
    state.manager = createCloudAccounts(path.join(directory, 'vault'))
    transport = fixtureRequest(provider)
    state.request = transport.request
    vi.spyOn(axios, 'post').mockResolvedValue({data: {access_token: 'private-access', refresh_token: 'private-refresh', expires_in: 3600}})
    const app = express(); app.use(express.json()); registerCloudAccounts(app, db)
    await new Promise<void>((resolve, reject) => { server = app.listen(0, '127.0.0.1', (error?: Error) => error ? reject(error) : resolve()); server.once('error', reject) })
    origin = `http://127.0.0.1:${(server.address() as {port: number}).port}/api/cloud-accounts`
  })
  afterEach(async () => { await new Promise<void>(resolve => server.close(() => resolve())); closeTestDb(fixture); fs.rmSync(directory, {recursive: true, force: true}); vi.restoreAllMocks() })
  async function json(url: string, data?: unknown) {
    const response = await fetch(origin + url, data === undefined ? undefined : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)})
    expect(response.status).toBeLessThan(300)
    return response.json() as Promise<any>
  }
  async function connect(name: string) {
    const account = await json('', {provider, name, clientId: 'application', clientSecret: 'PRIVATE-SECRET', redirectUri: `${origin}/oauth/callback`})
    const {url, state: oauthState} = await json(`/${account.id}/oauth/start`, {})
    expect(new URL(url).searchParams.get('code_challenge_method')).toBe('S256')
    const callback = await fetch(`${origin}/oauth/callback?state=${oauthState}&code=test`)
    expect(callback.status).toBe(200)
    expect((await fetch(`${origin}/oauth/callback?state=${oauthState}&code=replayed`)).status).toBe(400)
    return account
  }
  const replaceFile = () => Object.assign(transport.file, {modifiedTime: '2026-10-02T12:00:00Z', cTag: 'v2', rev: 'v2'})
  async function playback() {
    const account = await connect('Playback')
    const added = await json(`/${account.id}/import`, {key: transport.key})
    const plan = await json(`/media/${added.id}/playable`)
    return {account, added, url: origin.replace('/api/cloud-accounts', '') + plan.url}
  }
  it('pins every range to the original version and rejects a replacement without changing saved metadata', async () => {
    const {added, url} = await playback()
    const original = fixture.sqlite.prepare('SELECT * FROM mediaLocations WHERE mediaId = ?').get(added.id)
    const first = await fetch(url, {headers: {Range: 'bytes=2-5'}})
    expect(first.status).toBe(206); expect(await first.text()).toBe('2345')
    replaceFile()
    const next = await fetch(url, {headers: {Range: 'bytes=2-5'}})
    expect(next.status).toBe(409); expect(await next.json()).toMatchObject({code: 'source_version_changed'})
    expect(fixture.sqlite.prepare('SELECT * FROM mediaLocations WHERE mediaId = ?').get(added.id)).toEqual(original)
    expect((await fetch(`${origin}/media/${added.id}/playable`)).status).toBe(409)
  })
  it('rejects a replacement between stat and read before publishing bytes', async () => {
    const {url} = await playback()
    const request = transport.request.getMockImplementation()!
    transport.request.mockImplementation(async (address, options) => {
      const response = await request(address, options)
      if (options.stream) replaceFile()
      return response
    })
    const response = await fetch(url)
    expect(response.status).toBe(409); expect(await response.json()).toMatchObject({code: 'source_version_changed'})
  })
  it('rejects an old ticket after switching libraries, retargeting the card or signing in again', async () => {
    const {account, added, url} = await playback()
    db.path = `${directory}-other`
    expect((await fetch(url)).status).toBe(409)
    db.path = directory
    const repo = createMediaRepository(db.drizzle), previous = repo.findById(added.id)!.path
    repo.updateById(added.id, {path: '/other/movie.mp4'})
    expect((await fetch(url)).status).toBe(409)
    repo.updateById(added.id, {path: previous})
    const head = await fetch(url, {method: 'HEAD'})
    expect(head.status).toBe(200); expect(head.headers.get('content-length')).toBe('10')
    await json(`/${account.id}/oauth/start`, {})
    expect((await fetch(url)).status).toBe(410)
  })
  it('connects two accounts, imports idempotently, preserves metadata and plays a byte range', async () => {
    const first = await connect('First'), second = await connect('Second')
    const listed = await json('')
    expect(listed).toMatchObject([{authenticated: true}, {authenticated: true}])
    expect(JSON.stringify(listed)).not.toMatch(/PRIVATE|private-access|private-refresh|clientSecret/)
    expect(listCatalogSources(db).map(v => v.name)).toEqual(expect.arrayContaining(['First', 'Second']))
    const page = await json(`/${first.id}/files`), key = page.entries.find((e: any) => !e.isDirectory).resourceKey
    const metadata = await json(`/${first.id}/metadata?key=${encodeURIComponent(key)}`)
    expect(metadata).toMatchObject({name: 'sample.mp4', size: 10, contentType: 'video/mp4', mediaMetadata: {duration: 2}})
    const added = await json(`/${first.id}/import`, {key}), other = await json(`/${second.id}/import`, {key})
    expect(added.id).not.toBe(other.id)
    const repo = createMediaRepository(db.drizzle)
    repo.updateById(added.id, {name: 'My title', rating: 4})
    expect(await json(`/${first.id}/import`, {key})).toMatchObject({id: added.id, created: false, title: 'My title'})
    expect(repo.findById(added.id)).toMatchObject({name: 'My title', rating: 4})
    expect(createVideoMetadataRepository(db.drizzle).findByMediaId(added.id)).toMatchObject({duration: 2, width: 640, height: 360})
    expect(parseCloudMediaPath(repo.findById(added.id)!.path)).toMatchObject({connectionId: first.id, provider, resourceKey: key})
    expect(isRemoteMediaPath(repo.findById(added.id)!.path)).toBe(true)
    expect(resolveMediaLocation(db, added.id)).toMatchObject({provider, connection: {id: first.id}})
    expect(copyCandidates(db, added.id)[0]).toMatchObject({provider, path: repo.findById(added.id)!.path})
    const tokens = fixture.sqlite.prepare(`SELECT ${CATALOG_SOURCE_TOKENS_SQL} AS tokens FROM media WHERE id = ?`).get(added.id) as {tokens: string}
    expect(JSON.parse(tokens.tokens)).toEqual(expect.arrayContaining([provider, `connection:${first.id}`]))
    const playable = await json(`/media/${added.id}/playable`)
    const response = await fetch(origin.replace('/api/cloud-accounts', '') + playable.url, {headers: {Range: 'bytes=2-5'}})
    expect(response.status).toBe(206); expect(response.headers.get('content-range')).toBe('bytes 2-5/10'); expect(await response.text()).toBe('2345')
    expect(await json(`/${first.id}/logout`, {})).toEqual({ok: true})
    expect((await json('')).find((a: any) => a.id === second.id).authenticated).toBe(true)
    expect((await fetch(`${origin}/${first.id}/files`)).status).toBe(409)
    const restored = createCloudAccounts(path.join(directory, 'vault'))
    expect(restored.list(db).find(a => a.id === second.id)?.authenticated).toBe(true)
    const disk = fs.readdirSync(path.join(directory, 'vault')).filter(v => v.endsWith('.enc')).map(v => fs.readFileSync(path.join(directory, 'vault', v))).map(v => v.toString()).join('')
    expect(disk).not.toContain('PRIVATE-SECRET')
  })
  it('serves saved metadata snapshots without contacting the provider and filters local or trashed media', async () => {
    const account = await connect('Metadata')
    const {key} = fixtureRequest(provider)
    const added = await json(`/${account.id}/import`, {key})
    const local = createMediaRepository(db.drizzle).create({path: '/local.mp4'})
    await json(`/${account.id}/logout`, {})
    createVideoMetadataRepository(db.drizzle).updateByMediaId(added.id, {duration: 95, width: 1920, height: 1080})
    const calls = state.request.mock.calls.length
    const response = await json('/metadata/snapshot', {ids: [added.id, added.id, local.id, 999999]})
    expect(response.items).toHaveLength(1)
    expect(response.items[0]).toMatchObject({id: added.id, duration: 95, width: 1920, height: 1080,
      path: createMediaRepository(db.drizzle).findById(added.id)!.path})
    expect(state.request).toHaveBeenCalledTimes(calls)
    const invalid = await fetch(`${origin}/metadata/snapshot`, {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ids: Array.from({length: 65}, (_, i) => i + 1)})})
    expect(invalid.status).toBe(400)
    createMediaRepository(db.drizzle).updateById(added.id, {deletedAt: '2026'})
    expect((await json('/metadata/snapshot', {ids: [added.id]})).items).toEqual([])
  })

  it('includes NAS metadata and thumbnail readiness in local snapshots', async () => {
    const card = createMediaRepository(db.drizzle).create({path: 'nas://11111111-1111-4111-8111-111111111111/movie.mp4',
      mediaTypeId: createMediaTypesRepository(db.drizzle).findByType('video')!.id, filesize: 100})
    createVideoMetadataRepository(db.drizzle).create({mediaId: card.id, duration: 20, width: 640, height: 360})
    const calls = state.request.mock.calls.length
    expect((await json('/metadata/snapshot', {ids: [card.id]})).items[0]).toMatchObject({id: card.id, thumbnailState: 'pending', duration: 20})
    const folder = path.join(directory, 'media/videos/thumbs')
    fs.mkdirSync(folder, {recursive: true})
    const jpeg = Buffer.alloc(512); jpeg[0] = 0xff; jpeg[1] = 0xd8
    fs.writeFileSync(path.join(folder, `${card.id}.jpg`), jpeg)
    expect((await json('/metadata/snapshot', {ids: [card.id]})).items[0]).toMatchObject({id: card.id, thumbnailState: 'ready', thumbnailVersion: expect.any(Number)})
    expect(state.request).toHaveBeenCalledTimes(calls)
  })

  it('rejects documents and isolates sign-in cancellation from other accounts', async () => {
    const first = await connect('First')
    const second = state.manager.create(db, {provider, name: 'Second', clientId: 'app', redirectUri: `${origin}/oauth/callback`})
    const started = state.manager.start(db, second.id)
    await expect(state.manager.callback(started.state, undefined, true)).rejects.toThrow('oauth_denied')
    expect(state.manager.list(db).find((a: any) => a.id === first.id).authenticated).toBe(true)
    const adapter = state.manager.adapter(db, first.id)
    vi.spyOn(adapter, 'stat').mockResolvedValue({resourceKey: 'document', name: 'notes.txt', size: 10, contentType: 'text/plain', isDirectory: false, version: 'v1'})
    await expect(importCloudFile(db, first.id, 'document', adapter)).rejects.toMatchObject({code: 'unsupported_media'})
  })
})
