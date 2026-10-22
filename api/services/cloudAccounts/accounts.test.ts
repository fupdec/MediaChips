// @vitest-environment node
import fs from 'fs'
import os from 'os'
import path from 'path'
import axios from 'axios'
import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {createTestDb, closeTestDb, type TestDb} from '../../db/testUtils/createTestDb'
import type {ApiDb} from '../../types/db'
import {createCloudAccounts} from './accounts'
let directory: string, fixture: TestDb, db: ApiDb
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-oauth-')); fixture = createTestDb('oauth-accounts'); db = {...fixture, path: directory} })
afterEach(() => { vi.restoreAllMocks(); closeTestDb(fixture); fs.rmSync(directory, {force: true, recursive: true}) })
const input = {provider: 'onedrive', name: 'First', clientId: 'application', redirectUri: 'http://localhost:12321/api/cloud-accounts/oauth/callback'}
it('re-enters credentials on another host while retaining the source identity and expires old OAuth states', async () => {
  const first = createCloudAccounts(path.join(directory, 'first-vault')), account = first.create(db, input)
  const original = first.start(db, account.id)
  first.configure(db, account.id, {...input, name: 'Renamed'})
  await expect(first.callback(original.state, 'code')).rejects.toThrow('oauth_state_expired')
  const other = createCloudAccounts(path.join(directory, 'other-vault'))
  expect(other.list(db)).toMatchObject([{id: account.id, authenticated: false}])
  expect(other.configure(db, account.id, input)).toMatchObject({id: account.id, authenticated: false})
  vi.spyOn(axios, 'post').mockResolvedValue({data: {access_token: 'access', refresh_token: 'refresh', expires_in: 3600}})
  await other.callback(other.start(db, account.id).state, 'code')
  expect(other.list(db)).toMatchObject([{id: account.id, authenticated: true}])
  expect(() => other.configure(db, account.id, {...input, provider: 'dropbox'})).toThrow('provider_cannot_change')
})
it('does not restore credentials when logout races with an OAuth exchange', async () => {
  const manager = createCloudAccounts(path.join(directory, 'vault')), account = manager.create(db, input)
  let resolve!: (value: any) => void
  vi.spyOn(axios, 'post').mockImplementation(() => new Promise(done => { resolve = done }))
  const callback = manager.callback(manager.start(db, account.id).state, 'code')
  manager.logout(db, account.id)
  const rejected = expect(callback).rejects.toThrow('account_changed')
  resolve({data: {access_token: 'old-session', expires_in: 3600}})
  await rejected
  expect(manager.list(db)[0].authenticated).toBe(false)
})
it('reports denial, cancellation, expiry after restart and consumes state once', async () => {
  const manager = createCloudAccounts(path.join(directory, 'vault')), account = manager.create(db, input)
  const denied = manager.start(db, account.id)
  expect(manager.result(db, account.id, denied.state)).toBe('waiting')
  await expect(manager.callback(denied.state, undefined, true)).rejects.toThrow('oauth_denied')
  expect(manager.result(db, account.id, denied.state)).toBe('oauth_denied')
  const cancelled = manager.start(db, account.id)
  manager.cancel(db, account.id)
  expect(manager.result(db, account.id, cancelled.state)).toBe('cancelled')
  await expect(manager.callback(cancelled.state, 'late')).rejects.toThrow('oauth_state_expired')
  const interrupted = manager.start(db, account.id)
  expect(createCloudAccounts(path.join(directory, 'vault')).result(db, account.id, interrupted.state)).toBe('expired')
})
it('cancels an in-flight exchange without restoring tokens', async () => {
  const manager = createCloudAccounts(path.join(directory, 'vault')), account = manager.create(db, input)
  let resolve!: (value: any) => void
  vi.spyOn(axios, 'post').mockImplementation(() => new Promise(done => { resolve = done }))
  const attempt = manager.start(db, account.id), callback = manager.callback(attempt.state, 'code')
  manager.cancel(db, account.id)
  const rejected = expect(callback).rejects.toThrow('account_changed')
  resolve({data: {access_token: 'late'}})
  await rejected
  expect(manager.result(db, account.id, attempt.state)).toBe('cancelled')
  expect(manager.list(db)[0].authenticated).toBe(false)
})
it('persists authorization across restart, refreshes once and requires sign-in after revocation', async () => {
  const vault = path.join(directory, 'vault'), manager = createCloudAccounts(vault), account = manager.create(db, input)
  const post = vi.spyOn(axios, 'post').mockResolvedValue({data: {access_token: 'expired', refresh_token: 'refresh', expires_in: -1}})
  const attempt = manager.start(db, account.id)
  await manager.callback(attempt.state, 'code')
  expect(new URL(attempt.url).searchParams.get('code_challenge_method')).toBe('S256')
  expect(String(post.mock.calls[0][1])).toContain('code_verifier=')
  await expect(manager.callback(attempt.state, 'replay')).rejects.toThrow('oauth_state_expired')
  const restarted = createCloudAccounts(vault)
  expect(restarted.list(db)[0].authenticated).toBe(true)
  post.mockRejectedValue({isAxiosError: true, response: {data: {error: 'invalid_grant'}}})
  const adapter = restarted.adapter(db, account.id)
  await expect(adapter.list('root')).rejects.toThrow('auth_required')
  expect(restarted.list(db)[0].authenticated).toBe(false)
  expect(JSON.stringify(restarted.list(db))).not.toContain('refresh')
  adapter.close()
})

it.each(['onedrive', 'dropbox'] as const)('%s refreshes once after restart and invalidates old adapters after logout/reconnect', async provider => {
  const vault = path.join(directory, 'vault'), manager = createCloudAccounts(vault)
  const first = manager.create(db, {...input, provider}), second = manager.create(db, {...input, provider, name: 'Second'})
  const post = vi.spyOn(axios, 'post').mockResolvedValue({data: {access_token: 'expired', refresh_token: 'refresh', expires_in: -1}})
  for (const account of [first, second]) await manager.callback(manager.start(db, account.id).state, 'code')
  const restarted = createCloudAccounts(vault)
  const old = restarted.adapter(db, first.id)
  const previousAdapter = axios.defaults.adapter
  axios.defaults.adapter = async config => ({config, status: 200, statusText: 'OK', headers: {}, data: {id: 'file', name: '文件.mp4', size: 10}})
  try {
    post.mockResolvedValue({data: {access_token: 'fresh', expires_in: 3600}})
    await Promise.all([old.stat('file'), old.stat('file')])
    expect(post).toHaveBeenCalledTimes(3)
    expect(String(post.mock.calls[2][1])).toContain('refresh_token=refresh')
    restarted.logout(db, first.id)
    await expect(old.stat('file')).rejects.toThrow('auth_required')
    expect(restarted.list(db).find(a => a.id === second.id)?.authenticated).toBe(true)
    await restarted.callback(restarted.start(db, first.id).state, 'again')
    await expect(old.stat('file')).rejects.toThrow('auth_required')
    await expect(restarted.adapter(db, first.id).stat('file')).resolves.toMatchObject({name: '文件.mp4'})
  } finally { axios.defaults.adapter = previousAdapter }
})
