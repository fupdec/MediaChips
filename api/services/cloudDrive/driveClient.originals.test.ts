// @vitest-environment node
import {Readable} from 'stream'
import axios from 'axios'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {createGoogleDriveTransport} from './driveClient'
import type {DriveConfig, DriveOAuthTokens} from './types'
import type {DriveTokenStore} from './tokenStore'
vi.mock('axios', () => ({default: {get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn()}}))
vi.mock('./oauth', () => ({getValidAccessToken: vi.fn(async () => 'test-access-token')}))
const config: DriveConfig = {clientId: 'id', clientSecret: 'secret', redirectUri: 'http://localhost/api/drive/oauth/callback', scopes: ['https://www.googleapis.com/auth/drive'], configured: true, mock: false, tokenStorePath: ''}
let tokens: DriveOAuthTokens
const store = {get: () => tokens} as DriveTokenStore
const folder = {id: 'parent', name: 'Parent', mimeType: 'application/vnd.google-apps.folder', parents: [], capabilities: {canAddChildren: true}}
const file = {id: 'file', name: 'old.mp4', mimeType: 'video/mp4', size: '4', parents: ['old-parent'], capabilities: {canEdit: true, canDelete: true}, md5Checksum: 'digest'}
beforeEach(() => {
  vi.clearAllMocks(); tokens = {accessToken: 'token', scope: 'https://www.googleapis.com/auth/drive'}
  vi.mocked(axios.get).mockImplementation(async url => ({data: String(url).endsWith('/file') ? file : folder, headers: {etag: 'v1'}}))
})
describe('Drive write protocol and authorization', () => {
  it('does not send writes with a legacy read-only authorization', async () => {
    tokens.scope = 'https://www.googleapis.com/auth/drive.readonly'
    const writes = createGoogleDriveTransport(config, store).originals!
    await expect(writes.generateId()).rejects.toMatchObject({code: 'drive_write_authorization'})
    await expect(writes.remove('file')).rejects.toMatchObject({code: 'drive_write_authorization'})
    expect(axios.get).not.toHaveBeenCalled(); expect(axios.delete).not.toHaveBeenCalled()
  })
  it('reserves IDs and streams large uploads via a resumable session', async () => {
    const transport = createGoogleDriveTransport(config, store)
    vi.mocked(axios.get).mockResolvedValueOnce({data: {ids: ['reserved-id']}})
    expect(await transport.originals!.generateId()).toBe('reserved-id')
    vi.mocked(axios.post).mockResolvedValueOnce({headers: {location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=example'}})
    let uploaded = ''
    vi.mocked(axios.put).mockImplementationOnce(async (_url, input) => {
      for await (const chunk of input as Readable) uploaded += chunk.toString()
      return {data: {...file, id: 'reserved-id'}, headers: {etag: 'v2'}}
    })
    const result = await transport.originals!.create('reserved-id', 'parent', '.mediachips-unique.part', Readable.from(['da', 'ta']), 4)
    expect(uploaded).toBe('data'); expect(result).toMatchObject({id: 'reserved-id', size: 4, etag: 'v2'})
    expect(axios.post).toHaveBeenCalledWith('https://www.googleapis.com/upload/drive/v3/files', {id: 'reserved-id', name: '.mediachips-unique.part', parents: ['parent'], mimeType: 'application/octet-stream'}, expect.objectContaining({params: expect.objectContaining({uploadType: 'resumable'}), headers: expect.objectContaining({'X-Upload-Content-Length': '4'})}))
    expect(axios.put).toHaveBeenCalledWith(expect.any(String), expect.any(Readable), expect.objectContaining({maxRedirects: 0, maxBodyLength: Infinity, headers: expect.objectContaining({'Content-Length': '4'})}))
  })
  it('never sends authorization to an untrusted upload session URL', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({headers: {location: 'https://other.invalid/upload'}})
    await expect(createGoogleDriveTransport(config, store).originals!.create('reserved-id', 'parent', 'file', Readable.from(['data']), 4)).rejects.toThrow('Invalid Drive upload session')
    expect(axios.put).not.toHaveBeenCalled()
  })
  it('queries a saved session and sends only bytes beyond the provider-confirmed offset', async () => {
    const open = vi.fn(() => Readable.from(['ta'])), save = vi.fn()
    vi.mocked(axios.put).mockResolvedValueOnce({status: 308, headers: {range: 'bytes=0-1'}})
      .mockImplementationOnce(async (_url, input) => {
        let body = ''; for await (const chunk of input as Readable) body += chunk.toString()
        expect(body).toBe('ta')
        return {status: 200, data: file, headers: {}}
      })
    const session = 'https://www.googleapis.com/upload/drive/v3/files?upload_id=saved'
    await createGoogleDriveTransport(config, store).originals!.create('reserved-id', 'parent', 'file', undefined, 4, undefined, 'video/mp4', {session, open, save})
    expect(axios.post).not.toHaveBeenCalled(); expect(open).toHaveBeenCalledWith(2)
    expect(axios.put).toHaveBeenNthCalledWith(1, session, undefined, expect.objectContaining({maxRedirects: 0,
      headers: expect.objectContaining({'Content-Length': '0', 'Content-Range': 'bytes */4'})}))
    expect(axios.put).toHaveBeenNthCalledWith(2, session, expect.any(Readable), expect.objectContaining({headers: expect.objectContaining({'Content-Length': '2', 'Content-Range': 'bytes 2-3/4'})}))
    expect(save).toHaveBeenCalledWith(session, 2); expect(save).toHaveBeenLastCalledWith(undefined, 4)
  })
  it('journals a new session before consuming bytes and retains it after interruption', async () => {
    const save = vi.fn(), open = vi.fn(() => { expect(save).toHaveBeenCalledWith(expect.any(String), 0); return Readable.from(['data']) })
    vi.mocked(axios.post).mockResolvedValueOnce({headers: {location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=new'}})
    vi.mocked(axios.put).mockRejectedValueOnce(new Error('Disconnected'))
    await expect(createGoogleDriveTransport(config, store).originals!.create('reserved-id', 'parent', 'file', undefined, 4, undefined, undefined, {save, open})).rejects.toThrow('Disconnected')
    expect(save).toHaveBeenCalledTimes(1)
  })
  it('starts a new session under the same reserved ID when the saved session expires', async () => {
    const save = vi.fn(), open = vi.fn(() => Readable.from(['data']))
    vi.mocked(axios.put).mockResolvedValueOnce({status: 404, headers: {}}).mockResolvedValueOnce({status: 200, data: file, headers: {}})
    vi.mocked(axios.post).mockResolvedValueOnce({headers: {location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=new'}})
    await createGoogleDriveTransport(config, store).originals!.create('reserved-id', 'parent', 'file', undefined, 4, undefined, undefined,
      {session: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=expired', save, open})
    expect(open).toHaveBeenCalledWith(0); expect(save).toHaveBeenNthCalledWith(1, undefined, 0)
    expect(axios.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({id: 'reserved-id'}), expect.any(Object))
  })
  it('recovers a completed session without opening the spool again', async () => {
    const open = vi.fn(), save = vi.fn()
    vi.mocked(axios.put).mockResolvedValueOnce({status: 201, data: file, headers: {}})
    await createGoogleDriveTransport(config, store).originals!.create('reserved-id', 'parent', 'file', undefined, 4, undefined, undefined,
      {session: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=complete', save, open})
    expect(open).not.toHaveBeenCalled(); expect(axios.post).not.toHaveBeenCalled()
  })
  it.each(['bytes=1-2', 'bytes=0-4', 'bytes=0-999999999999999999999'])('rejects invalid confirmed offsets: %s', async range => {
    const open = vi.fn()
    vi.mocked(axios.put).mockResolvedValueOnce({status: 308, headers: {range}})
    await expect(createGoogleDriveTransport(config, store).originals!.create('reserved-id', 'parent', 'file', undefined, 4, undefined, undefined,
      {session: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=saved', save: vi.fn(), open})).rejects.toThrow('Invalid Drive upload range')
    expect(open).not.toHaveBeenCalled()
  })
  it('updates parent membership explicitly and uses the observed ETag', async () => {
    vi.mocked(axios.patch).mockResolvedValue({data: {...file, name: 'new.mp4', parents: ['parent']}, headers: {etag: 'v2'}})
    const result = await createGoogleDriveTransport(config, store).originals!.update('file', 'new.mp4', 'parent', 'v1')
    expect(result.name).toBe('new.mp4')
    expect(axios.patch).toHaveBeenCalledWith(expect.stringContaining('/file'), {name: 'new.mp4'}, expect.objectContaining({params: expect.objectContaining({addParents: 'parent', removeParents: 'old-parent'}), headers: expect.objectContaining({'If-Match': 'v1'})}))
  })
  it('refuses changed ETags and denied capabilities before a destructive request', async () => {
    const transport = createGoogleDriveTransport(config, store)
    await expect(transport.originals!.remove('file', 'old-etag')).rejects.toMatchObject({code: 'source_changed'})
    vi.mocked(axios.get).mockResolvedValue({data: {...file, capabilities: {canEdit: false, canDelete: false}}, headers: {etag: 'v1'}})
    await expect(transport.originals!.remove('file', 'v1')).rejects.toMatchObject({code: 'permission_denied'})
    await expect(transport.originals!.update('file', 'new.mp4')).rejects.toMatchObject({code: 'permission_denied'})
    expect(axios.delete).not.toHaveBeenCalled(); expect(axios.patch).not.toHaveBeenCalled()
  })
  it('permanently removes only the requested Drive ID with a conditional request', async () => {
    vi.mocked(axios.delete).mockResolvedValue({status: 204})
    await createGoogleDriveTransport(config, store).originals!.remove('file', 'v1')
    expect(axios.delete).toHaveBeenCalledWith('https://www.googleapis.com/drive/v3/files/file', expect.objectContaining({params: {supportsAllDrives: true}, headers: expect.objectContaining({'If-Match': 'v1'})}))
  })
})
