// @vitest-environment node
import axios from 'axios'
import {beforeEach, expect, it, vi} from 'vitest'
import {downloadRemoteThumbnail} from './remoteThumbnailDownload'
vi.mock('axios', () => ({default: {get: vi.fn()}}))
beforeEach(() => vi.mocked(axios.get).mockReset())
it('bounds image downloads and uses the public DNS agent', async () => {
  vi.mocked(axios.get).mockResolvedValue({status: 200, data: Buffer.from('image'), headers: {}})
  expect(await downloadRemoteThumbnail('https://images.example.com/poster')).toEqual(Buffer.from('image'))
  expect(axios.get).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
    maxContentLength: 8 * 1024 * 1024, maxRedirects: 0, proxy: false, httpsAgent: expect.any(Object),
  }))
})
it('never forwards a provider bearer token on redirects', async () => {
  vi.mocked(axios.get).mockResolvedValueOnce({status: 302, headers: {location: 'https://cdn.example.com/poster'}})
    .mockResolvedValueOnce({status: 200, data: Buffer.from('image'), headers: {}})
  await downloadRemoteThumbnail('https://images.example.com/poster', undefined, {Authorization: 'Bearer secret'})
  expect(axios.get).toHaveBeenLastCalledWith('https://cdn.example.com/poster', expect.objectContaining({headers: {}}))
})
it('blocks private destinations, including redirects', async () => {
  await expect(downloadRemoteThumbnail('https://localhost/private')).rejects.toThrow('Invalid thumbnail')
  expect(axios.get).not.toHaveBeenCalled()
  vi.mocked(axios.get).mockResolvedValueOnce({status: 302, headers: {location: 'http://127.0.0.1/private'}})
  await expect(downloadRemoteThumbnail('https://images.example.com/poster')).rejects.toThrow('Invalid thumbnail')
  expect(axios.get).toHaveBeenCalledTimes(1)
})
