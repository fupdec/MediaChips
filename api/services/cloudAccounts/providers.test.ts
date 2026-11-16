// @vitest-environment node
import {describe, it, expect, vi} from 'vitest'
import {createCloudAdapter, type CloudRequest} from './providers'
import {downloadRemoteThumbnail} from '../remoteThumbnailDownload'
vi.mock('../remoteThumbnailDownload', () => ({downloadRemoteThumbnail: vi.fn(async () => Buffer.from('cover'))}))
import type {CloudProvider} from '../../../shared/cloudAccounts'

import {fixtureRequest} from './testFixtures'

describe.each(['gdrive', 'onedrive', 'dropbox'] as const)('%s common provider contract', provider => {
  it('lists folders with continuation, reads technical metadata and seeks bytes', async () => {
    const {key, request} = fixtureRequest(provider)
    const adapter = createCloudAdapter(provider, async () => 'private-token', request)
    const page = await adapter.list('root')
    expect(page.entries).toMatchObject([{isDirectory: true}, {name: 'sample.mp4', size: 10}])
    expect((await adapter.list('root', page.nextPageToken)).entries).toHaveLength(1)
    expect(await adapter.stat(key)).toMatchObject({resourceKey: key, contentType: 'video/mp4', mediaMetadata: {duration: 2, width: 640, height: 360}})
    expect(await adapter.read(key, 'bytes=2-5')).toMatchObject({status: 206, body: Buffer.from('2345'), headers: {'content-range': 'bytes 2-5/10'}})
    expect(adapter.capabilities).toMatchObject({view: true, seek: true, move: false, delete: false})
    if (provider === 'onedrive') expect(request.mock.calls.find(([url]) => url.includes('download.example'))?.[1].headers).not.toHaveProperty('Authorization')
    const controller = new AbortController(); controller.abort()
    await expect(adapter.stat(key, controller.signal)).rejects.toThrow()
    await expect(adapter.read(key, 'bytes=0-1,4-5')).rejects.toThrow('Invalid Range')
  })
  it('maps provider authentication errors without exposing tokens', async () => {
    const request: CloudRequest = async () => { throw {response: {status: 401}, config: {headers: {Authorization: 'Bearer SECRET'}}} }
    await expect(createCloudAdapter(provider, async () => 'SECRET', request).stat('key')).rejects.toMatchObject({code: 'auth_required', status: 409})
  })
})
it('rejects an untrusted OneDrive continuation before sending a bearer token', async () => {
  const request = vi.fn<CloudRequest>()
  await expect(createCloudAdapter('onedrive', async () => 'SECRET', request).list('root', 'https://attacker.test/')).rejects.toThrow('Invalid continuation')
  expect(request).not.toHaveBeenCalled()
})

it.each(['gdrive', 'onedrive', 'dropbox'] as const)('fetches a %s thumbnail without reading the original', async provider => {
  const request = vi.fn<CloudRequest>(async url => ({
    status: 200, headers: {}, data: provider === 'dropbox' ? Buffer.from('cover')
      : provider === 'gdrive' ? {thumbnailLink: 'https://lh3.googleusercontent.com/poster'}
      : {value: [{large: {url: 'https://images.example.com/poster'}}]},
  }))
  const adapter = createCloudAdapter(provider, async () => 'private-token', request)
  expect(await adapter.thumbnail!('key')).toEqual(Buffer.from('cover'))
  expect(request).toHaveBeenCalledTimes(1)
  const [url, options] = request.mock.calls[0]
  if (provider === 'gdrive') {
    expect(url).toContain('fields=thumbnailLink')
    expect(downloadRemoteThumbnail).toHaveBeenLastCalledWith('https://lh3.googleusercontent.com/poster', undefined, {Authorization: 'Bearer private-token'})
  } else if (provider === 'onedrive') {
    expect(url).toContain('/thumbnails')
    expect(downloadRemoteThumbnail).toHaveBeenLastCalledWith('https://images.example.com/poster', undefined)
  } else {
    expect(url).toBe('https://content.dropboxapi.com/2/files/get_thumbnail_v2')
    expect(JSON.parse(options.headers!['Dropbox-API-Arg'])).toMatchObject({resource: {'.tag': 'path', path: 'key'}, format: 'jpeg'})
  }
})

it('uses ASCII arguments and an explicit content type for Dropbox content downloads', async () => {
  const request = vi.fn<CloudRequest>(async () => ({status: 200, headers: {}, data: Buffer.from('cover')}))
  const adapter = createCloudAdapter('dropbox', async () => 'token', request)
  const key = '/Приёмка 文件 🎬/видео.mp4'
  await adapter.read(key, 'bytes=0-3')
  await adapter.thumbnail!(key)
  for (const [, options] of request.mock.calls) {
    expect(options.headers?.['Content-Type']).toBe('application/octet-stream')
    expect(options.headers?.['Dropbox-API-Arg']).not.toMatch(/[^\x20-\x7e]/)
    expect(options.data).toBeUndefined()
  }
  expect(JSON.parse(request.mock.calls[0][1].headers!['Dropbox-API-Arg'])).toEqual({path: key})
  expect(JSON.parse(request.mock.calls[1][1].headers!['Dropbox-API-Arg']).resource.path).toBe(key)
})

it.each(['gdrive', 'onedrive', 'dropbox'] as const)('preserves a safe %s Retry-After without retrying the request', async provider => {
  const request = vi.fn<CloudRequest>(async () => {throw {response: {status: 429, headers: {'retry-after': '17'}, data: {secret: 'PRIVATE'}}}})
  const adapter = createCloudAdapter(provider, async () => 'PRIVATE', request)
  await expect(adapter.list('root')).rejects.toMatchObject({status: 429, code: 'rate_limited', retryAfter: 17})
  expect(request).toHaveBeenCalledTimes(1)
  try {await adapter.list('root')} catch (error) {expect(JSON.stringify(error)).not.toContain('PRIVATE')}
})
