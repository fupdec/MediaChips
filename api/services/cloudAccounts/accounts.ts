import {randomBytes, randomUUID, createHash} from 'crypto'
import path from 'path'
import os from 'os'
import axios from 'axios'
import {eq} from 'drizzle-orm'
import type {ApiDb} from '../../types/db'
import {sourceConnections} from '../../db/schema/mediaSources'
import {CloudAccountInputSchema, type CloudAccount, type CloudAccountInput, type CloudProvider} from '../../../shared/cloudAccounts'
import {createNasCredentialStore} from '../nas/credentials'
import {createCloudAdapter} from './providers'

type PrivateAccount = CloudAccountInput & {accessToken?: string; refreshToken?: string; expiresAt?: number; generation: string}
const endpoints = {
  gdrive: {auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', scope: 'https://www.googleapis.com/auth/drive.readonly'},
  onedrive: {auth: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token', scope: 'offline_access Files.Read'},
  dropbox: {auth: 'https://www.dropbox.com/oauth2/authorize', token: 'https://api.dropboxapi.com/oauth2/token', scope: 'files.metadata.read files.content.read'},
}
const failure = (code: string, status = 409) => Object.assign(new Error(code), {code, status})
export function createCloudAccounts(directory = path.join(process.env.MEDIA_CHIPS_DATA_DIR || process.app_folder || path.join(os.homedir(), '.mediachips'), 'cloud-accounts')) {
  const vault = createNasCredentialStore(directory)
  const pending = new Map<string, {id: string; verifier: string; expires: number; generation: string; provider: CloudProvider}>()
  const outcomes = new Map<string, {id: string; result: string; expires: number}>()
  const refreshes = new Map<string, Promise<string>>()
  const get = (id: string): PrivateAccount => {
    if (!vault.has(id)) throw failure('auth_required')
    return JSON.parse(vault.get(id).password || '{}')
  }
  const save = (id: string, value: PrivateAccount) => vault.set(id, {password: JSON.stringify(value)})
  const row = (db: ApiDb, id: string) => {
    const account = db.drizzle.select().from(sourceConnections).where(eq(sourceConnections.id, id)).get()
    if (!account || !['gdrive', 'onedrive', 'dropbox'].includes(account.provider) || account.credentialRef !== id) throw failure('account_not_found', 404)
    return account
  }
  const exchange = async (id: string, value: PrivateAccount, fields: Record<string, string>, signal?: AbortSignal) => {
    const body = new URLSearchParams({...fields, client_id: value.clientId})
    if (value.clientSecret) body.set('client_secret', value.clientSecret)
    let data: any
    try { data = (await axios.post(endpoints[value.provider].token, body, {signal, timeout: 30_000, maxRedirects: 0})).data }
    catch (err) {
      const reason = axios.isAxiosError(err) ? err.response?.data?.error : undefined
      if (reason === 'invalid_grant' && fields.grant_type === 'refresh_token' && get(id).generation === value.generation) {
        save(id, {...value, accessToken: undefined, refreshToken: undefined, generation: randomUUID()})
        throw failure('auth_required')
      }
      throw failure(['invalid_client', 'invalid_grant', 'redirect_uri_mismatch'].includes(reason) ? reason : 'network_error')
    }
    if (!data.access_token) throw failure('cloud_authorization_failed')
    // Logout/reconfiguration during a token exchange must not restore an old session.
    if (get(id).generation !== value.generation) throw failure('account_changed')
    const next = {...value, accessToken: String(data.access_token), refreshToken: data.refresh_token || (fields.grant_type === 'refresh_token' ? value.refreshToken : undefined),
      expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000}
    save(id, next)
    return next.accessToken!
  }
  return {
    list(db: ApiDb): CloudAccount[] {
      return db.drizzle.select().from(sourceConnections).all().filter(a => a.credentialRef === a.id && a.provider !== 'nas').map(a => {
        let credentials: PrivateAccount | undefined
        try { credentials = get(a.id) } catch {}
        return {id: a.id, provider: a.provider as CloudProvider, name: JSON.parse(a.config).name || a.provider,
          redirectUri: credentials?.redirectUri || '', authenticated: !!credentials?.accessToken && ((credentials.expiresAt || 0) > Date.now() || !!credentials.refreshToken)}
      })
    },
    create(db: ApiDb, raw: unknown) {
      const input = CloudAccountInputSchema.parse(raw)
      const id = randomUUID()
      save(id, {...input, generation: randomUUID()})
      try { db.drizzle.insert(sourceConnections).values({id, provider: input.provider, config: JSON.stringify({name: input.name}), credentialRef: id, createdAt: new Date().toISOString()}).run() }
      catch (err) { vault.delete(id); throw err }
      return this.list(db).find(a => a.id === id)!
    },
    configure(db: ApiDb, id: string, raw: unknown) {
      const account = row(db, id), input = CloudAccountInputSchema.parse(raw)
      if (input.provider !== account.provider) throw failure('provider_cannot_change', 400)
      if (vault.has(id)) this.cancel(db, id)
      save(id, {...input, generation: randomUUID()})
      db.drizzle.update(sourceConnections).set({config: JSON.stringify({name: input.name})}).where(eq(sourceConnections.id, id)).run()
      for (const [state, entry] of pending) if (entry.id === id) pending.delete(state)
      return this.list(db).find(a => a.id === id)!
    },
    start(db: ApiDb, id: string) {
      row(db, id)
      const value = get(id)
      this.cancel(db, id)
      for (const [state, entry] of pending) if (entry.expires < Date.now() || entry.id === id) pending.delete(state)
      if (pending.size >= 100) throw failure('too_many_authorizations', 429)
      for (const [key, result] of outcomes) if (result.expires < Date.now()) outcomes.delete(key)
      while (outcomes.size >= 1000) outcomes.delete(outcomes.keys().next().value!)
      const state = randomBytes(32).toString('hex'), verifier = randomBytes(48).toString('base64url')
      pending.set(state, {id, verifier, expires: Date.now() + 10 * 60_000, generation: get(id).generation, provider: value.provider})
      outcomes.set(state, {id, result: 'waiting', expires: Date.now() + 10 * 60_000})
      const query = new URLSearchParams({client_id: value.clientId, redirect_uri: value.redirectUri, response_type: 'code', state,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', scope: endpoints[value.provider].scope})
      if (value.provider === 'gdrive') { query.set('access_type', 'offline'); query.set('prompt', 'consent select_account') }
      if (value.provider === 'onedrive') query.set('prompt', 'select_account')
      if (value.provider === 'dropbox') query.set('token_access_type', 'offline')
      return {url: `${endpoints[value.provider].auth}?${query}`, state}
    },
    async callback(state: string, code?: string, denied = false) {
      const entry = pending.get(state)
      pending.delete(state)
      if (!entry || entry.expires < Date.now()) throw failure('oauth_state_expired', 400)
      try {
        const value = get(entry.id)
        if (denied || !code) throw failure('oauth_denied', 400)
        if (value.generation !== entry.generation) throw failure('account_changed')
        await exchange(entry.id, value, {grant_type: 'authorization_code', code, redirect_uri: value.redirectUri, code_verifier: entry.verifier})
        outcomes.set(state, {...outcomes.get(state)!, result: 'connected'})
      } catch (err) {
        const outcome = outcomes.get(state)
        if (outcome?.result === 'waiting') outcomes.set(state, {...outcome, result: (err as {code?: string}).code || 'failed'})
        throw err
      }
      return entry.id
    },
    result(db: ApiDb, id: string, state: string) {
      row(db, id)
      const outcome = outcomes.get(state)
      return outcome?.id === id && outcome.expires > Date.now() ? outcome.result : 'expired'
    },
    cancel(db: ApiDb, id: string) {
      row(db, id)
      const value = get(id)
      save(id, {...value, generation: randomUUID()})
      for (const [state, entry] of pending) if (entry.id === id) pending.delete(state)
      for (const [state, outcome] of outcomes) if (outcome.id === id && outcome.result === 'waiting') outcomes.set(state, {...outcome, result: 'cancelled'})
    },
    logout(db: ApiDb, id: string) {
      this.cancel(db, id)
      const value = get(id)
      save(id, {...value, accessToken: undefined, refreshToken: undefined, expiresAt: undefined, generation: randomUUID()})
      for (const [state, entry] of pending) if (entry.id === id) pending.delete(state)
    },
    adapter(db: ApiDb, id: string) {
      const account = row(db, id)
      const initial = get(id)
      return createCloudAdapter(account.provider as CloudProvider, async signal => {
        signal?.throwIfAborted()
        const value = get(id)
        if (value.generation !== initial.generation || !value.accessToken) throw failure('auth_required')
        if ((value.expiresAt || 0) > Date.now() + 60_000) return value.accessToken
        if (!value.refreshToken) throw failure('auth_required')
        let active = refreshes.get(`${id}:${value.generation}`)
        if (!active) {
          active = exchange(id, value, {grant_type: 'refresh_token', refresh_token: value.refreshToken}).finally(() => refreshes.delete(`${id}:${value.generation}`))
          refreshes.set(`${id}:${value.generation}`, active)
        }
        const result = await active
        signal?.throwIfAborted()
        return result
      })
    },
  }
}
let singleton: ReturnType<typeof createCloudAccounts> | undefined
export const getCloudAccounts = () => singleton ||= createCloudAccounts()
