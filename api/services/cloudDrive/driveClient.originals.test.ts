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
