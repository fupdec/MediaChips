import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}))

import axios from 'axios'
import { downloadRemoteImage } from './remoteImageDownload'

describe('downloadRemoteImage', () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset()
  })

  it('returns downloaded image bytes for valid responses', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: Buffer.alloc(256, 1),
      headers: {'content-type': 'image/jpeg'},
    })

    const buffer = await downloadRemoteImage('https://cdn.example.com/poster.jpg', {retries: 1})
    expect(buffer.length).toBe(256)
  })

  it('retries when the first download attempt fails', async () => {
    vi.mocked(axios.get)
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue({
        data: Buffer.alloc(256, 2),
        headers: {'content-type': 'image/jpeg'},
      })

    const buffer = await downloadRemoteImage('https://cdn.example.com/poster.jpg', {retries: 2})
    expect(buffer.length).toBe(256)
    expect(axios.get).toHaveBeenCalled()
  })

  it('rejects unsupported content types', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: Buffer.alloc(256, 3),
      headers: {'content-type': 'text/html'},
    })

    await expect(
      downloadRemoteImage('https://cdn.example.com/poster.jpg', {retries: 1}),
    ).rejects.toThrow('Unexpected content type')
  })
})
